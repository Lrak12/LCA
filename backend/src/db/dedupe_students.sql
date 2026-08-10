-- ============================================================================
-- dedupe_students.sql
-- Remove duplicate STUDENT records (same person enrolled more than once).
--
-- WHY: the "Add Student" flow generates a fresh student_id every time and
-- auto-uniquifies the login email, so the same person can be enrolled twice
-- (e.g. Doe, Jane = 2621 & 2623; Sanoy, Tyron = 1070 & 2626). This script keeps
-- ONE record per person and deletes the extras (plus their orphaned login/auth
-- rows).
--
-- MATCH RULE (what counts as "the same person"):
--   same lower(trim(first_name)) + lower(trim(last_name)).
--   >>> If two DIFFERENT people can share a name, tighten this by also
--       partitioning on gl_id and/or date_of_birth (see the commented lines).
--
-- KEEP RULE (which duplicate survives):
--   the row with the MOST PACE activity, then most points, then lowest
--   student_id (oldest). The empty re-enrollment is the one deleted, so no
--   academic history is lost.
--
-- SAFETY:
--   1. Take a backup / snapshot first (Supabase: Database > Backups).
--   2. Run STEP 1 (preview) and eyeball KEEP vs DELETE before anything else.
--   3. STEP 2 runs inside a transaction — verify the temp-table review, then
--      COMMIT. Anything looks wrong -> ROLLBACK and nothing changed.
--   4. Deleting `student` relies on FK ON DELETE CASCADE (same as the app's own
--      delete). If a child FK is RESTRICT you'll get an error — see the optional
--      child-delete block at the bottom.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────
-- STEP 1 — PREVIEW ONLY (no changes). Review before running STEP 2.
-- ─────────────────────────────────────────────────────────────────────────
WITH activity AS (
  SELECT
    s.student_id,
    s.user_id,
    s.gl_id,
    lower(btrim(s.first_name))          AS fn,
    lower(btrim(s.last_name))           AS ln,
    COUNT(sp.sp_id)                     AS pace_count,
    COALESCE(SUM(sp.points_earned), 0)  AS total_points
  FROM student s
  LEFT JOIN student_pace sp ON sp.student_id = s.student_id
  GROUP BY s.student_id, s.user_id, s.gl_id, s.first_name, s.last_name
),
ranked AS (
  SELECT
    a.*,
    COUNT(*)     OVER (PARTITION BY fn, ln /*, gl_id, date_of_birth*/)                       AS dup_count,
    ROW_NUMBER() OVER (PARTITION BY fn, ln /*, gl_id, date_of_birth*/
                       ORDER BY pace_count DESC, total_points DESC, student_id ASC)          AS rn
  FROM activity a
)
SELECT
  student_id,
  fn AS first_name,
  ln AS last_name,
  gl_id,
  pace_count,
  total_points,
  CASE WHEN rn = 1 THEN 'KEEP' ELSE 'DELETE' END AS action
FROM ranked
WHERE dup_count > 1
ORDER BY ln, fn, action, student_id;


-- ─────────────────────────────────────────────────────────────────────────
-- STEP 2 — DELETE the duplicates (keeps the richest row per person).
-- Runs in a transaction: review the temp table, then COMMIT or ROLLBACK.
-- ─────────────────────────────────────────────────────────────────────────
BEGIN;

CREATE TEMP TABLE dup_to_delete ON COMMIT DROP AS
WITH activity AS (
  SELECT
    s.student_id,
    s.user_id,
    lower(btrim(s.first_name))          AS fn,
    lower(btrim(s.last_name))           AS ln,
    COUNT(sp.sp_id)                     AS pace_count,
    COALESCE(SUM(sp.points_earned), 0)  AS total_points
  FROM student s
  LEFT JOIN student_pace sp ON sp.student_id = s.student_id
  GROUP BY s.student_id, s.user_id, s.first_name, s.last_name
),
ranked AS (
  SELECT
    a.*,
    COUNT(*)     OVER (PARTITION BY fn, ln /*, gl_id, date_of_birth*/)                AS dup_count,
    ROW_NUMBER() OVER (PARTITION BY fn, ln /*, gl_id, date_of_birth*/
                       ORDER BY pace_count DESC, total_points DESC, student_id ASC)   AS rn
  FROM activity a
)
SELECT r.student_id, r.user_id, u.auth_id
FROM ranked r
LEFT JOIN users u ON u.user_id = r.user_id
WHERE r.dup_count > 1
  AND r.rn > 1;                 -- rn = 1 is the KEEPER; everything else goes

-- Review exactly what will be removed:
SELECT * FROM dup_to_delete;

-- 1) delete the duplicate student rows (PACE/child rows cascade, as in the app)
DELETE FROM student
WHERE student_id IN (SELECT student_id FROM dup_to_delete);

-- 2) delete the now-orphaned login rows
DELETE FROM users
WHERE user_id IN (SELECT user_id FROM dup_to_delete WHERE user_id IS NOT NULL);

-- 3) delete the matching Supabase Auth accounts
DELETE FROM auth.users
WHERE id IN (SELECT auth_id FROM dup_to_delete WHERE auth_id IS NOT NULL);

-- Everything correct?  ->  COMMIT;
-- Something off?        ->  ROLLBACK;
COMMIT;


-- ─────────────────────────────────────────────────────────────────────────
-- OPTIONAL — only if STEP 2 errored with a foreign-key (RESTRICT) violation.
-- Run these INSIDE the transaction, right before the DELETE FROM student.
-- (Deleted duplicates usually have no PACE rows, so this is rarely needed.)
-- ─────────────────────────────────────────────────────────────────────────
-- DELETE FROM pace_test_result WHERE sp_id IN
--   (SELECT sp_id FROM student_pace WHERE student_id IN (SELECT student_id FROM dup_to_delete));
-- DELETE FROM self_test_result WHERE sp_id IN
--   (SELECT sp_id FROM student_pace WHERE student_id IN (SELECT student_id FROM dup_to_delete));
-- DELETE FROM student_pace              WHERE student_id IN (SELECT student_id FROM dup_to_delete);
-- DELETE FROM diagnostic_assessment     WHERE student_id IN (SELECT student_id FROM dup_to_delete);
-- DELETE FROM student_parent_contact    WHERE student_id IN (SELECT student_id FROM dup_to_delete);
-- DELETE FROM student_parent            WHERE student_id IN (SELECT student_id FROM dup_to_delete);
-- DELETE FROM attendance                WHERE student_id IN (SELECT student_id FROM dup_to_delete);
-- DELETE FROM attendance_monthly_summary WHERE student_id IN (SELECT student_id FROM dup_to_delete);
-- DELETE FROM class_academic_summary    WHERE student_id IN (SELECT student_id FROM dup_to_delete);
-- DELETE FROM pace_quarterly_projection WHERE student_id IN (SELECT student_id FROM dup_to_delete);
-- DELETE FROM student_academic_remarks  WHERE student_id IN (SELECT student_id FROM dup_to_delete);

-- ============================================================================
-- remove_supervisors.sql
-- Permanently remove specific SUPERVISOR (teacher) accounts and their linked
-- login/auth rows. The app has no "Delete" action for supervisors yet
-- (services/employees.service.js only has create/update/list) — this is a
-- manual, run-it-yourself cleanup, same pattern as dedupe_students.sql.
--
-- TARGETS (teacher_id):
--   110  jenniferlopez@lca.com
--   205  supervisor, testfor
--   203  wqer, shaw
--
-- WHAT THIS DOES:
--   1. Detaches these teachers from grade_level / attendance / student_pace by
--      setting those teacher_id columns to NULL. Nulling, not deleting — every
--      student record, PACE, and attendance entry stays intact; only the
--      "who's the supervisor / who recorded this" pointer is cleared.
--   2. Deletes the `teacher` row, the linked `users` row, and the Supabase
--      Auth account (auth.users) — this removes their login entirely.
--
-- WHAT THIS DOES NOT TOUCH:
--   Historical records with a `recorded_by` = teacher_id (pace_test_result,
--   check_up_result, self_test_result, class_academic_summary,
--   attendance_monthly_summary, student_academic_remarks,
--   pace_quarterly_projection) are left alone by default — that's student
--   academic history, not the teacher's own data. STEP 0 below checks whether
--   any of these 3 teacher_ids show up there. If they do AND that column is
--   NOT NULL, the DELETE in STEP 1 will fail with a foreign-key error — see
--   the OPTIONAL block at the bottom for how to clear it (also non-destructive
--   to the underlying record).
--
-- SAFETY:
--   1. Take a backup / snapshot first (Supabase: Database > Backups).
--   2. Run STEP 0 (preview) and read the results before touching anything.
--   3. STEP 1 runs inside a transaction — review the reviewed-rows output,
--      then COMMIT. Anything looks wrong -> ROLLBACK and nothing changes.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────
-- STEP 0 — PREVIEW ONLY (no changes). Confirms the 3 accounts exist and shows
-- every table where they're referenced, including the "recorded_by" history
-- tables this script does not touch. Review before running STEP 1.
-- ─────────────────────────────────────────────────────────────────────────
SELECT t.teacher_id, t.first_name, t.last_name, u.email, u.auth_id
FROM public.teacher t
LEFT JOIN public.users u ON u.user_id = t.user_id
WHERE t.teacher_id IN (110, 205, 203);

-- References that will be cleared (nulled) by this script:
SELECT 'grade_level'   AS table_name, gl_id::text AS row_id, teacher_id FROM public.grade_level  WHERE teacher_id IN (110, 205, 203)
UNION ALL
SELECT 'attendance',                  att_id::text,           teacher_id FROM public.attendance    WHERE teacher_id IN (110, 205, 203)
UNION ALL
SELECT 'student_pace',                sp_id::text,             teacher_id FROM public.student_pace  WHERE teacher_id IN (110, 205, 203);

-- History tables this script does NOT touch by default — just checking for
-- potential foreign-key conflicts before you run STEP 1.
SELECT 'pace_test_result'           AS table_name, count(*) AS rows_found FROM public.pace_test_result         WHERE recorded_by IN (110, 205, 203)
UNION ALL
SELECT 'check_up_result',                                    count(*)                FROM public.check_up_result           WHERE recorded_by IN (110, 205, 203)
UNION ALL
SELECT 'self_test_result',                                    count(*)                FROM public.self_test_result          WHERE recorded_by IN (110, 205, 203)
UNION ALL
SELECT 'class_academic_summary',                              count(*)                FROM public.class_academic_summary    WHERE recorded_by IN (110, 205, 203)
UNION ALL
SELECT 'attendance_monthly_summary',                          count(*)                FROM public.attendance_monthly_summary WHERE recorded_by IN (110, 205, 203)
UNION ALL
SELECT 'student_academic_remarks',                            count(*)                FROM public.student_academic_remarks   WHERE recorded_by IN (110, 205, 203)
UNION ALL
SELECT 'pace_quarterly_projection',                           count(*)                FROM public.pace_quarterly_projection  WHERE recorded_by IN (110, 205, 203);


-- ─────────────────────────────────────────────────────────────────────────
-- STEP 1 — Delete the 3 supervisors. Runs inside a transaction: review the
-- reviewed-rows output, then COMMIT or ROLLBACK.
-- If STEP 0's history-table check returned any rows > 0 AND that DELETE below
-- fails with a foreign-key violation, ROLLBACK, uncomment the matching line(s)
-- in the OPTIONAL block at the bottom (placed right before step 3 here), then
-- re-run this whole STEP 1.
-- ─────────────────────────────────────────────────────────────────────────
BEGIN;

-- 1) Detach these teachers from grade levels / attendance / PACE rows they're
--    the acting supervisor on. Nulling, not deleting — no student data lost.
UPDATE public.grade_level  SET teacher_id = NULL WHERE teacher_id IN (110, 205, 203);
UPDATE public.attendance   SET teacher_id = NULL WHERE teacher_id IN (110, 205, 203);
UPDATE public.student_pace SET teacher_id = NULL WHERE teacher_id IN (110, 205, 203);

-- 2) Capture their user_id / auth_id before the teacher row is gone.
CREATE TEMP TABLE removed_teachers ON COMMIT DROP AS
SELECT t.teacher_id, t.user_id, u.auth_id
FROM public.teacher t
LEFT JOIN public.users u ON u.user_id = t.user_id
WHERE t.teacher_id IN (110, 205, 203);

-- Review: should be exactly 3 rows, matching the 3 targets above.
SELECT * FROM removed_teachers;

-- 3) Delete the teacher profile rows.
DELETE FROM public.teacher
WHERE teacher_id IN (SELECT teacher_id FROM removed_teachers);

-- 4) Delete their login rows.
DELETE FROM public.users
WHERE user_id IN (SELECT user_id FROM removed_teachers WHERE user_id IS NOT NULL);

-- 5) Delete their Supabase Auth accounts (removes the login entirely).
DELETE FROM auth.users
WHERE id IN (SELECT auth_id FROM removed_teachers WHERE auth_id IS NOT NULL);

-- Everything correct?  ->  COMMIT;
-- Something off?        ->  ROLLBACK;
COMMIT;


-- ─────────────────────────────────────────────────────────────────────────
-- OPTIONAL — only if STEP 0 showed rows in a "recorded_by" history table AND
-- step 3's DELETE FROM public.teacher above failed with a foreign-key error.
-- Nulls the recorded_by pointer on those rows (the underlying score/attendance
-- record itself is kept — only "who recorded it" is forgotten). Uncomment the
-- lines you need, run them INSIDE the transaction right before step 3 above,
-- then continue with steps 3-5.
-- ─────────────────────────────────────────────────────────────────────────
-- UPDATE public.pace_test_result           SET recorded_by = NULL WHERE recorded_by IN (110, 205, 203);
-- UPDATE public.check_up_result            SET recorded_by = NULL WHERE recorded_by IN (110, 205, 203);
-- UPDATE public.self_test_result           SET recorded_by = NULL WHERE recorded_by IN (110, 205, 203);
-- UPDATE public.class_academic_summary     SET recorded_by = NULL WHERE recorded_by IN (110, 205, 203);
-- UPDATE public.attendance_monthly_summary SET recorded_by = NULL WHERE recorded_by IN (110, 205, 203);
-- UPDATE public.student_academic_remarks   SET recorded_by = NULL WHERE recorded_by IN (110, 205, 203);
-- UPDATE public.pace_quarterly_projection  SET recorded_by = NULL WHERE recorded_by IN (110, 205, 203);

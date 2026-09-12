-- Store two attendance marks per student per school day.
-- Existing daily marks are copied to both AM and PM as requested.

ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS session text;

UPDATE public.attendance
SET session = 'AM'
WHERE session IS NULL;

-- Remove the old one-row-per-student/day uniqueness constraint, regardless
-- of the name assigned when the table was originally created.
DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT con.conname
    FROM pg_constraint con
    WHERE con.conrelid = 'public.attendance'::regclass
      AND con.contype = 'u'
      AND pg_get_constraintdef(con.oid) ~* 'UNIQUE\s*\(student_id,\s*date_recorded\)'
  LOOP
    EXECUTE format('ALTER TABLE public.attendance DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

-- Cover databases where the old rule was created as a standalone unique
-- index rather than an ALTER TABLE constraint.
DO $$
DECLARE
  index_name text;
BEGIN
  FOR index_name IN
    SELECT index_class.relname
    FROM pg_index idx
    JOIN pg_class index_class ON index_class.oid = idx.indexrelid
    WHERE idx.indrelid = 'public.attendance'::regclass
      AND idx.indisunique
      AND NOT idx.indisprimary
      AND pg_get_indexdef(idx.indexrelid) ~* '\(student_id,\s*date_recorded\)'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS public.%I', index_name);
  END LOOP;
END $$;

ALTER TABLE public.attendance
  ALTER COLUMN session SET DEFAULT 'AM',
  ALTER COLUMN session SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.attendance'::regclass
      AND conname = 'attendance_student_date_session_key'
  ) THEN
    ALTER TABLE public.attendance
      ADD CONSTRAINT attendance_student_date_session_key
      UNIQUE (student_id, date_recorded, session);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.attendance'::regclass
      AND conname = 'attendance_session_check'
  ) THEN
    ALTER TABLE public.attendance
      ADD CONSTRAINT attendance_session_check CHECK (session IN ('AM', 'PM'));
  END IF;
END $$;

INSERT INTO public.attendance
  (student_id, teacher_id, date_recorded, status, remarks, notes, time_recorded, session)
SELECT
  student_id, teacher_id, date_recorded, status, remarks, notes, time_recorded, 'PM'
FROM public.attendance
WHERE session = 'AM'
ON CONFLICT (student_id, date_recorded, session) DO NOTHING;

-- Half-day present/tardy totals require decimal-compatible report columns.
ALTER TABLE public.attendance_monthly_summary
  ALTER COLUMN present_count TYPE numeric(8,1) USING present_count::numeric,
  ALTER COLUMN tardy_count TYPE numeric(8,1) USING tardy_count::numeric;

ALTER TABLE public.class_academic_summary
  ALTER COLUMN tardiness_count TYPE numeric(8,1) USING tardiness_count::numeric;

COMMENT ON COLUMN public.attendance.session IS
  'School-day attendance period: AM or PM.';

NOTIFY pgrst, 'reload schema';

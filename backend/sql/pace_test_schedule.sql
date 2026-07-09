-- PACE Test request + scheduling (Student requests → Supervisor schedules)
-- Flow: a student who PASSED the self-test (score >= 90) requests the PACE test
--   → a row is created here with status 'Requested' and NO scheduled_at.
-- The supervisor schedules it → fills scheduled_at and sets status 'Scheduled'.
-- Run in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS pace_test_schedule (
  pts_id         SERIAL PRIMARY KEY,
  student_id     INTEGER NOT NULL REFERENCES student(student_id)     ON DELETE CASCADE,
  teacher_id     INTEGER REFERENCES teacher(teacher_id)              ON DELETE CASCADE,
  sy_id          INTEGER NOT NULL REFERENCES school_year(sy_id)      ON DELETE CASCADE,
  subject        VARCHAR(120) NOT NULL,
  pace_number    INTEGER NOT NULL,
  quarter        INTEGER CHECK (quarter BETWEEN 1 AND 4),
  -- One column holds BOTH the assessment date and time. NULL while still a request.
  scheduled_at   TIMESTAMPTZ,
  status         VARCHAR(20) NOT NULL DEFAULT 'Requested'
                   CHECK (status IN ('Requested', 'Scheduled', 'Completed', 'Cancelled', 'Rescheduled', 'Missed')),
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pace_test_schedule_student ON pace_test_schedule (student_id);

-- Service role needs full access (PostgREST otherwise errors "permission denied").
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pace_test_schedule TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- The PACE Monitoring profile card's "Generated <date>" line reads
-- pace_quarterly_projection.created_at. Add the column if it does not yet exist
-- (existing rows get NOW() at migration time).
ALTER TABLE pace_quarterly_projection
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

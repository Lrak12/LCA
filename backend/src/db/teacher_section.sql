-- =============================================================================
-- teacher_section table
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- =============================================================================

-- 1. Create table
CREATE TABLE IF NOT EXISTS public.teacher_section (
  id           SERIAL PRIMARY KEY,
  teacher_id   INTEGER NOT NULL REFERENCES public.teacher(teacher_id) ON DELETE CASCADE,
  section_name TEXT    NOT NULL,
  grade_name   TEXT,                         -- e.g. 'Grade 5'  (informational)
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (teacher_id, section_name)
);

-- Enable RLS (Supabase best-practice; service role bypasses it anyway)
ALTER TABLE public.teacher_section ENABLE ROW LEVEL SECURITY;

-- Grants required for Supabase Data API (supabase-js / PostgREST)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teacher_section TO service_role;
GRANT SELECT ON public.teacher_section TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.teacher_section_id_seq TO service_role;

-- 2. Seed sample data
--    Assign the FIRST teacher in the DB to two sections.
--    Re-run after adding more teachers and adjust teacher_id accordingly.

INSERT INTO public.teacher_section (teacher_id, section_name, grade_name)
SELECT
  t.teacher_id,
  s.section_name,
  s.grade_name
FROM
  (SELECT teacher_id FROM public.teacher ORDER BY teacher_id LIMIT 1) t
  CROSS JOIN (
    VALUES
      ('Wisdom', 'Grade 5'),
      ('Faith',  'Grade 5')
  ) AS s(section_name, grade_name)
ON CONFLICT (teacher_id, section_name) DO NOTHING;

-- =============================================================================
-- To verify:
--   SELECT ts.*, t.first_name, t.last_name
--   FROM public.teacher_section ts
--   JOIN public.teacher t USING (teacher_id);
--
-- To assign a specific teacher manually:
--   INSERT INTO public.teacher_section (teacher_id, section_name, grade_name)
--   VALUES (<teacher_id>, 'Hope', 'Grade 6');
-- =============================================================================

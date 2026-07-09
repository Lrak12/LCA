-- =============================================================================
-- section table
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.section (
  section_id    SERIAL PRIMARY KEY,
  name          TEXT    NOT NULL UNIQUE,
  grade_level   TEXT    NOT NULL,
  faculty_slots INTEGER NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.section ENABLE ROW LEVEL SECURITY;

-- Grants required for Supabase Data API (supabase-js / PostgREST)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.section TO service_role;
GRANT SELECT ON public.section TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.section_section_id_seq TO service_role;

-- Seed sample sections (adjust to match your school's actual sections)
INSERT INTO public.section (name, grade_level, faculty_slots)
VALUES
  ('Wisdom',     'Grade 5', 1),
  ('Faith',      'Grade 5', 1),
  ('Excellence', 'Grade 9', 2),
  ('Patience',   'Grade 4', 2)
ON CONFLICT (name) DO NOTHING;

-- =============================================================================
-- To verify:
--   SELECT * FROM public.section ORDER BY grade_level, name;
--
-- To add more sections manually:
--   INSERT INTO public.section (name, grade_level, faculty_slots)
--   VALUES ('Hope', 'Grade 6', 1);
-- =============================================================================

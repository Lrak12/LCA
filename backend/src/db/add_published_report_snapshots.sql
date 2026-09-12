-- Freeze each report exactly as it looked when the supervisor published it.
-- Principal report endpoints read this JSON instead of recalculating live data.
ALTER TABLE public.report_submission
  ADD COLUMN IF NOT EXISTS published_snapshot jsonb;

COMMENT ON COLUMN public.report_submission.published_snapshot IS
  'Immutable report payload captured when the supervisor clicks Publish to Principal.';

CREATE INDEX IF NOT EXISTS report_submission_published_snapshot_idx
  ON public.report_submission (teacher_id, sy_id, report_type, quarter)
  WHERE published_snapshot IS NOT NULL;

-- Make the new column immediately visible to PostgREST/Supabase REST clients.
NOTIFY pgrst, 'reload schema';

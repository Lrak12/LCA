-- Self-Tests pass at 80%; official PACE Tests continue to pass at 90%.
-- Recalculate historical Self-Test flags so existing scores from 80 through 89
-- immediately use the new rule.
UPDATE public.self_test_result
SET passed = (score >= 80)
WHERE score IS NOT NULL
  AND passed IS DISTINCT FROM (score >= 80);

NOTIFY pgrst, 'reload schema';

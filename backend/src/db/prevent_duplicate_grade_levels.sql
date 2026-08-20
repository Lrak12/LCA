-- Prevent duplicate grade-level names within the same school year.
-- Names remain reusable in a different school year.

create unique index if not exists uq_grade_level_sy_name_ci
on public.grade_level (sy_id, lower(btrim(level_name)));

create unique index if not exists uq_grade_level_sy_order
on public.grade_level (sy_id, level_order)
where level_order is not null;

alter table public.grade_level
  drop constraint if exists grade_level_level_order_range_check;

alter table public.grade_level
  add constraint grade_level_level_order_range_check
  check (level_order is null or level_order between 1 and 12);

-- Repurpose the existing empty monthly_scripture_assignment table for the
-- student-specific, school-year Scripture record used by Class Academic Record.
-- There are exactly two Scripture entries per student; month and quarter are no
-- longer part of the record.

alter table public.monthly_scripture_assignment
  add column if not exists student_id integer references public.student(student_id) on delete cascade,
  add column if not exists recorded_by integer references public.teacher(teacher_id),
  add column if not exists updated_at timestamptz not null default now();

alter table public.monthly_scripture_assignment
  alter column principal_id drop not null,
  alter column quarter drop not null,
  alter column month drop not null;

alter table public.monthly_scripture_assignment
  drop constraint if exists monthly_scripture_assignment_sy_id_month_key;

-- The table was confirmed empty, so student_id can become required immediately.
alter table public.monthly_scripture_assignment
  alter column student_id set not null,
  alter column recorded_by set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'monthly_scripture_assignment_student_year_key'
      and conrelid = 'public.monthly_scripture_assignment'::regclass
  ) then
    alter table public.monthly_scripture_assignment
      add constraint monthly_scripture_assignment_student_year_key
      unique (student_id, sy_id);
  end if;
end $$;

grant usage on schema public to service_role;
grant select, insert, update on public.monthly_scripture_assignment to service_role;
grant usage, select on sequence public.monthly_scripture_assignment_msa_id_seq to service_role;

notify pgrst, 'reload schema';


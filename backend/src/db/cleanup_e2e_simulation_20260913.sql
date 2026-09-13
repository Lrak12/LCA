-- Removes only the three accounts and records created by the 2026-09-13 E2E
-- simulation. The assertions abort the transaction if any fixed ID no longer
-- belongs to the expected E2E identity.
begin;

do $$
begin
  if not exists (
    select 1
    from public.principal p
    join public.users u on u.user_id = p.user_id
    where p.principal_id = 153
      and p.user_id = 153
      and p.first_name = 'E2E'
      and p.last_name = 'Principal'
      and u.email = 'e2e.principal.20260913@example.com'
  ) then
    raise exception 'Safety check failed for E2E principal';
  end if;

  if not exists (
    select 1
    from public.teacher t
    join public.users u on u.user_id = t.user_id
    where t.teacher_id = 223
      and t.user_id = 154
      and t.first_name = 'E2E'
      and t.last_name = 'Supervisor'
      and u.email = 'e2e.supervisor.20260913@example.com'
  ) then
    raise exception 'Safety check failed for E2E supervisor';
  end if;

  if not exists (
    select 1
    from public.student s
    join public.users u on u.user_id = s.user_id
    where s.student_id = 2629
      and s.user_id = 155
      and s.first_name = 'E2E'
      and s.last_name = 'Learner'
      and u.email = 'e2e.learner@lca.edu'
  ) then
    raise exception 'Safety check failed for E2E learner';
  end if;
end $$;

create temp table e2e_auth_ids on commit drop as
select auth_id
from public.users
where user_id in (153, 154, 155)
  and auth_id is not null;

-- Remaining protected child data.
delete from public.pace_quarterly_projection where student_id = 2629;
delete from public.monthly_scripture_assignment where student_id = 2629;

-- Defensive cleanup for any simulation rows recreated after the initial pass.
delete from public.attendance where student_id = 2629 or teacher_id = 223;
delete from public.diagnostic_assessment where student_id = 2629;
delete from public.student_parent_contact where student_id = 2629;
delete from public.student_parent where student_id = 2629;
delete from public.student_supervisor_history where student_id = 2629 or teacher_id = 223;
delete from public.report_submission where teacher_id = 223;
delete from public.announcement where principal_id = 153;
update public.grade_level set teacher_id = null where teacher_id = 223;

delete from public.notification where user_id in (153, 154, 155);
delete from public.user_deactivation_history where user_id in (153, 154, 155);
delete from public.system_audit_log
where user_id in (153, 154, 155)
   or details ilike '%E2E Principal%'
   or details ilike '%E2E Supervisor%'
   or details ilike '%E2E Learner%';

delete from public.student where student_id = 2629;
delete from public.teacher where teacher_id = 223;
delete from public.principal where principal_id = 153;
delete from public.users where user_id in (153, 154, 155);
delete from auth.users where id in (select auth_id from e2e_auth_ids);

commit;

-- All values returned by this verification query must be zero.
select
  (select count(*) from public.users where user_id in (153, 154, 155)) as login_rows,
  (select count(*) from public.principal where principal_id = 153) as principal_rows,
  (select count(*) from public.teacher where teacher_id = 223) as supervisor_rows,
  (select count(*) from public.student where student_id = 2629) as student_rows,
  (select count(*) from public.pace_quarterly_projection where student_id = 2629) as projection_rows,
  (select count(*) from public.monthly_scripture_assignment where student_id = 2629) as scripture_rows,
  (select count(*) from public.system_audit_log where user_id in (153, 154, 155)) as audit_rows;

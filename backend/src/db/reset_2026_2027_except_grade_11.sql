-- Idempotent reset of academic activity for SY 2026-2027, preserving Grade 11.
-- Student/user profiles, grade levels, supervisors, PACE module configuration,
-- announcements, audit logs, and every Grade 11 record are intentionally kept.

begin;

create temporary table lca_reset_sy on commit drop as
select sy_id, start_date, end_date
from public.school_year
where year_label in ('2026-2027', 'SY 2026-2027');

do $$
begin
  if (select count(*) from lca_reset_sy) <> 1 then
    raise exception 'Expected exactly one 2026-2027 school year. Reset cancelled.';
  end if;
  if not exists (
    select 1
    from public.grade_level gl
    join lca_reset_sy sy on sy.sy_id = gl.sy_id
    where lower(btrim(gl.level_name)) = 'grade 11' or gl.level_order = 11
  ) then
    raise exception 'Grade 11 was not found for 2026-2027. Reset cancelled.';
  end if;
end
$$;

create temporary table lca_reset_grade_ids on commit drop as
select gl.gl_id, gl.teacher_id
from public.grade_level gl
join lca_reset_sy sy on sy.sy_id = gl.sy_id
where not (lower(btrim(gl.level_name)) = 'grade 11' or gl.level_order = 11);

create temporary table lca_keep_grade11_teacher_ids on commit drop as
select distinct gl.teacher_id
from public.grade_level gl
join lca_reset_sy sy on sy.sy_id = gl.sy_id
where (lower(btrim(gl.level_name)) = 'grade 11' or gl.level_order = 11)
  and gl.teacher_id is not null;

create temporary table lca_reset_student_ids on commit drop as
select s.student_id
from public.student s
where s.gl_id in (select gl_id from lca_reset_grade_ids);

create temporary table lca_reset_module_ids on commit drop as
select pm.module_id
from public.pace_module pm
where pm.gl_id in (select gl_id from lca_reset_grade_ids);

create temporary table lca_reset_sp_ids on commit drop as
select sp.sp_id
from public.student_pace sp
where sp.student_id in (select student_id from lca_reset_student_ids)
  and sp.module_id in (select module_id from lca_reset_module_ids);

delete from public.pace_test_result
where sp_id in (select sp_id from lca_reset_sp_ids);

delete from public.self_test_result
where sp_id in (select sp_id from lca_reset_sp_ids);

delete from public.check_up_result
where sp_id in (select sp_id from lca_reset_sp_ids);

-- Some deployments never created the legacy pace_test_schedule table. Use
-- dynamic SQL so the reset remains compatible with both schema versions.
do $$
begin
  if to_regclass('public.pace_test_schedule') is not null then
    execute $delete$
      delete from public.pace_test_schedule
      where sy_id = (select sy_id from lca_reset_sy)
        and student_id in (select student_id from lca_reset_student_ids)
    $delete$;
  end if;
end
$$;

delete from public.student_pace
where sp_id in (select sp_id from lca_reset_sp_ids);

delete from public.pace_quarterly_projection
where sy_id = (select sy_id from lca_reset_sy)
  and student_id in (select student_id from lca_reset_student_ids);

delete from public.attendance
where student_id in (select student_id from lca_reset_student_ids)
  and date_recorded between (select start_date from lca_reset_sy) and (select end_date from lca_reset_sy);

delete from public.attendance_monthly_summary
where sy_id = (select sy_id from lca_reset_sy)
  and student_id in (select student_id from lca_reset_student_ids);

delete from public.student_academic_remarks
where sy_id = (select sy_id from lca_reset_sy)
  and student_id in (select student_id from lca_reset_student_ids);

delete from public.class_academic_summary
where sy_id = (select sy_id from lca_reset_sy)
  and student_id in (select student_id from lca_reset_student_ids);

delete from public.diagnostic_assessment
where sy_id = (select sy_id from lca_reset_sy)
  and student_id in (select student_id from lca_reset_student_ids);

delete from public.monthly_scripture_assignment
where sy_id = (select sy_id from lca_reset_sy)
  and student_id in (select student_id from lca_reset_student_ids);

delete from public.report_submission
where sy_id = (select sy_id from lca_reset_sy)
  and teacher_id in (
    select distinct teacher_id
    from lca_reset_grade_ids
    where teacher_id is not null
      and teacher_id not in (select teacher_id from lca_keep_grade11_teacher_ids)
  );

commit;

notify pgrst, 'reload schema';

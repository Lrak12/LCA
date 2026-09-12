-- Remove the synthetic academic data created by the "Add realistic student data"
-- task. This intentionally preserves students, users/Auth accounts, grade-level
-- assignments, supervisor history, email changes, and Scripture entries.

begin;

create temporary table lca_demo_module_ids on commit drop as
select module_id
from public.pace_module
where description in (
  'Standard PACE module for the active school year.',
  'Synthetic demo record generated for the LCA capstone presentation.'
);

create temporary table lca_demo_sp_ids on commit drop as
select sp_id
from public.student_pace
where module_id in (select module_id from lca_demo_module_ids);

delete from public.pace_test_result
where sp_id in (select sp_id from lca_demo_sp_ids);

delete from public.self_test_result
where sp_id in (select sp_id from lca_demo_sp_ids);

delete from public.check_up_result
where sp_id in (select sp_id from lca_demo_sp_ids);

delete from public.student_pace
where sp_id in (select sp_id from lca_demo_sp_ids);

delete from public.attendance
where notes in (
  'Attendance recorded for this school day.',
  'Daily attendance recorded by the class supervisor.'
);

delete from public.attendance_monthly_summary
where sy_id in (select sy_id from public.school_year where is_active = true);

delete from public.student_academic_remarks
where sy_id in (select sy_id from public.school_year where is_active = true);

delete from public.class_academic_summary
where sy_id in (select sy_id from public.school_year where is_active = true);

-- Keep the student Scripture rows, but reset both entered Scripture values.
update public.monthly_scripture_assignment
set scripture_1st = null,
    scripture_2nd = null,
    updated_at = now()
where sy_id in (select sy_id from public.school_year where is_active = true);

delete from public.report_submission
where sy_id in (select sy_id from public.school_year where is_active = true);

delete from public.pace_quarterly_projection
where sy_id in (select sy_id from public.school_year where is_active = true);

delete from public.pace_module
where module_id in (select module_id from lca_demo_module_ids);

commit;

notify pgrst, 'reload schema';

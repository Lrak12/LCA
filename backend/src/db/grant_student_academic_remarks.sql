-- Fix backend saves for Supervisor Note, Bible Memory, and Reading WPM.
-- The Node backend uses Supabase's service_role. RLS bypass does not replace
-- normal PostgreSQL table and sequence privileges.

begin;

grant select, insert, update
on table public.student_academic_remarks
to service_role;

-- Grant the generated sar_id sequence only when this table uses one.
do $$
declare
  remarks_sequence text;
begin
  remarks_sequence := pg_get_serial_sequence(
    'public.student_academic_remarks',
    'sar_id'
  );

  if remarks_sequence is not null then
    execute format(
      'grant usage, select on sequence %s to service_role',
      remarks_sequence
    );
  end if;
end
$$;

commit;


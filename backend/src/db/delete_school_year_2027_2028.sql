-- Delete only the unintended, inactive SY 2027-2028 record.
-- Existing foreign keys will stop the delete if dependent records are present.

begin;

do $$
begin
  if not exists (
    select 1
    from public.school_year
    where sy_id = 6006
      and year_label = 'SY 2027-2028'
      and is_active = false
  ) then
    raise exception 'Inactive SY 2027-2028 (sy_id 6006) was not found. Nothing was deleted.';
  end if;
end
$$;

delete from public.school_year
where sy_id = 6006
  and year_label = 'SY 2027-2028'
  and is_active = false
returning sy_id, year_label, start_date, end_date, is_active;

commit;

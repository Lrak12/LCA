-- Preserve the actual publication time for announcements.
--
-- The original `date` column discarded the time portion of ISO timestamps.
-- When the returned YYYY-MM-DD value was rendered in Asia/Manila, JavaScript
-- interpreted it as midnight UTC and displayed 8:00 AM for every post.
--
-- Run this once in the Supabase SQL Editor. It is safe to run again.

do $$
declare
  posted_date_type text;
begin
  select data_type
    into posted_date_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'announcement'
    and column_name = 'posted_date';

  if posted_date_type = 'date' then
    -- The original time has already been lost for existing rows. Treat their
    -- date-only value as UTC midnight to preserve the time users saw before
    -- this migration; newly created rows retain their real timestamp.
    alter table public.announcement
      alter column posted_date type timestamptz
      using (posted_date::timestamp at time zone 'UTC');
  elsif posted_date_type = 'timestamp without time zone' then
    alter table public.announcement
      alter column posted_date type timestamptz
      using (posted_date at time zone 'Asia/Manila');
  end if;
end
$$;

alter table public.announcement
  alter column posted_date set default now();

comment on column public.announcement.posted_date is
  'Exact publication instant, stored with timezone; future values are scheduled announcements.';

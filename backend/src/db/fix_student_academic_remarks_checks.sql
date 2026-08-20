-- Keep the database validation in sync with the Academic Recording form.
-- Bible Memory is a category rating. Reading WPM is a whole number of zero or more.

begin;

alter table public.student_academic_remarks
  drop constraint if exists student_academic_remarks_bible_memory_rating_check;

alter table public.student_academic_remarks
  add constraint student_academic_remarks_bible_memory_rating_check
  check (
    bible_memory_rating is null
    or bible_memory_rating::text in (
      'Excellent',
      'Very Good',
      'Good',
      'Satisfactory',
      'Needs Improvement'
    )
  );

alter table public.student_academic_remarks
  drop constraint if exists student_academic_remarks_reading_wpm_check;

alter table public.student_academic_remarks
  add constraint student_academic_remarks_reading_wpm_check
  check (
    reading_wpm is null
    or case
      when btrim(reading_wpm::text) ~ '^[0-9]+$'
        then btrim(reading_wpm::text)::numeric >= 0
      else false
    end
  );

commit;

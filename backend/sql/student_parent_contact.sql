-- Parent / Guardian contact for a student (used by the Add Student modal).
-- One student may have multiple parent/guardian contacts. Run this on Supabase
-- before using the Parent/Guardian section of the Add Student form.
--
-- NOTE: student.student_id is referenced below. If your student_id is not a
-- bigint identity, adjust the column type of student_id to match.

create table if not exists student_parent_contact (
  contact_id              bigint generated always as identity primary key,
  student_id              bigint not null references student(student_id) on delete cascade,
  parent_name             text   not null,
  contact_number          text,
  email                   text,
  relationship_to_student text
);

create index if not exists idx_student_parent_contact_student
  on student_parent_contact (student_id);

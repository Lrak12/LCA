# LCA Project — Session Notes
**Last updated:** 2026-05-20 (session 2)
**Project:** Lifegiver Christian Academy School Management System
**Stack:** React (Vite) + Node.js/Express + Supabase

---

## Project Structure

```
LCA/
├── frontend/   (React + Vite + Tailwind + React Router)
└── backend/    (Node.js + Express + Supabase-js)
```

---

## Important Rules

- **Always ask first** if unsure about column names, table structure, or business logic. Do not assume.
- The user will provide DB table screenshots when needed.
- Never use `assigned_level_id` — it was dropped from `diagnostic_assessment`.
- Never use `result` column in `diagnostic_assessment` — dropped, replaced by `start_pace`.
- **Elective subjects (Music, Art, PE, TLE) are removed from scope** — no `elective_subject_grades` table.
- **Student record signatures are removed from scope** — no `student_record_signature` table.
- **Parents do not have their own accounts** — they view student progress through the student's account. PARENT is NOT a USER subtype.
- **PARENT is modeled as a multivalued composite attribute of STUDENT** in the conceptual ERD, implemented as a separate `student_parent_contact` table at the logical level.
- **`diagnostic_assessment.recorded_by`** → FK references `principal(principal_id)` — the principal records diagnostics, not the teacher or administrator.
- **Role strings in code are lowercase**: `'administrator'`, `'principal'`, `'teacher'`, `'student'` — never `'admin'`.

---

## User Roles (4 USER Subtypes)

The supertype/subtype hierarchy has **disjoint** and **total** constraints — every USER is exactly one subtype:

| Subtype | Description | ID Range |
|---|---|---|
| ADMINISTRATOR | System administrator (read-only access to audit logs) | 101–149 |
| PRINCIPAL | School principal (announcements, diagnostics, scripture assignments) | 150–199 |
| TEACHER | Classroom teacher (attendance, PACE assignment, grading) | 201–299 |
| STUDENT | Student (own progress + parent view) | 1000–2000 |

**Existing principal accounts:** Ana Padilla (ID 150), Karl J (ID 151)

---

## ERD Conceptual Model (Chen Notation)

Final ERD includes:

- **USER supertype** with 4 disjoint subtypes (ADMINISTRATOR, PRINCIPAL, TEACHER, STUDENT)
- **Parents** as multivalued composite attribute on STUDENT (double-lined ellipse with sub-attributes: parent_name, contact_number, email, relationship_to_student)
- **3 ternary relationships** decomposed into associative entities:
  - STUDENT_PACE (STUDENT + PACE_MODULE + TEACHER)
  - ATTENDANCE_MONTHLY_SUMMARY (STUDENT + SCHOOL_YEAR + TEACHER)
  - STUDENT_ACADEMIC_REMARKS (STUDENT + SCHOOL_YEAR + TEACHER)
  - CLASS_ACADEMIC_SUMMARY (STUDENT + SCHOOL_YEAR + TEACHER)
- **1 binary M:N**: PACE_QUARTERLY_PROJECTION (STUDENT + SCHOOL_YEAR — no teacher, system-generated)
- **2 weak entities** (double-bordered): SELF_TEST_RESULT, PACE_TEST_RESULT
- **1 multivalued composite attribute** of SCHOOL_YEAR: MONTHLY_SCRIPTURE_ASSIGNMENT (implemented as separate table)
- **SYSTEM_AUDIT_LOG**: only USER generates (ADMINISTRATOR has read-only access via permissions, not a DB relationship)

---

## Database Tables (Confirmed Schema as of 2026-05-20)

### `users`
- `user_id`, `auth_id` (uuid), `username`, `email`, `role`, `is_active`, `created_at`
- Role values: `'administrator'`, `'principal'`, `'teacher'`, `'student'` (lowercase)
- Check constraint: `users_role_check` enforces the 4 valid roles

### `administrator`
- `admin_id` (sequence: `administrator_admin_id_new_seq`, range 101–149), `user_id` (FK → users)
- `first_name`, `last_name`, `contact_number`

### `principal` ✅ (renamed from old `administrator` table)
- `principal_id` (sequence: `administrator_admin_id_seq`, current value 152), `user_id` (FK → users)
- `first_name`, `last_name`, `contact_number`
- **Existing records:** Ana Padilla (150), Karl J (151)

### `teacher`
- `teacher_id`, `user_id` (FK → users), `first_name`, `last_name`, `contact_number`
- ID range: 201–299

### `student`
- `student_id`, `user_id` (FK → users), `gl_id` (FK → `grade_level`)
- `first_name`, `last_name`, `date_of_birth`, `gender`, `address`, `contact_number`
- `enrollment_date`, `source` TEXT — `'imported'` (default) or `'diagnostic'`

### `student_parent_contact`
- `contact_id`, `student_id` (FK)
- `parent_name`, `contact_number`, `email`, `relationship_to_student`
- Replaces old `parent` + `student_parent` tables (still exist in DB but unused)

### `school_year`
- `sy_id`, `year_label`, `start_date`, `end_date`, `is_active`

### `grade_level`
- `gl_id`, `sy_id` (FK), `teacher_id` (FK, nullable), `level_name`, `level_order`

### `pace_module`
- `module_id`, `gl_id` (FK), `module_name`, `module_number`, `subject`, `description`

### `section`
- `section_id`, `name`, `grade_level`, `faculty_slots`, `created_at`

### `teacher_section`
- `id`, `teacher_id` (FK), `section_name`, `grade_name`, `created_at`

### `attendance`
- `att_id`, `student_id` (FK), `teacher_id` (FK), `date_recorded` ← renamed from `date`
- `status`, `remarks`, `notes`, `time_recorded`

### `student_pace`
- `sp_id`, `student_id` (FK), `module_id` (FK), `teacher_id` (FK) ← renamed from `assigned_by`
- `status` (default `'Assigned'`), `start_date`, `end_date`, `assigned_date`
- `homework` (boolean) ← renamed from `taken_home_for_homework`
- `ready_for_next` (boolean)

### `pace_test_result`
- `pacetest_id`, `sp_id` (FK → student_pace), `recorded_by` (FK → teacher)
- `score`, `date_taken`, `passed`, `quarter`, `notes`

### `self_test_result`
- `selftest_id`, `sp_id` (FK → student_pace)
- `score`, `date_taken`, `passed`, `attempt_no`, `quarter`, `notes`

### `check_up_result`
- `checkup_id`, `sp_id` (FK → student_pace), `recorded_by` (FK → teacher)
- `attempt_number`, `score`, `date_taken`

### `diagnostic_assessment`
- `diag_id`, `student_id` (FK), `sy_id` (FK)
- `recorded_by` (FK → `principal`) ← principal records diagnostics
- `placement_gl_id` (FK → grade_level)
- `test_date`, `score`, `subject`, `start_pace`, `learning_gaps`

### `announcement`
- `ann_id`, `principal_id` (FK → principal) ← renamed from `posted_by`
- `title`, `content`, `posted_date`, `audience_role`, `audience`, `is_active`

### `system_audit_log` ✅ Created
- `sal_id`, `user_id` (FK → users), `action`, `entity_affected`, `entity_id`
- `timestamp`, `details`

### `attendance_monthly_summary` ✅ Created
- `ams_id`, `student_id` (FK), `sy_id` (FK), `recorded_by` (FK → teacher)
- `month` (1–12), `present_count`, `absent_count`, `tardy_count`, `demerit_total`, `homework_days`
- UNIQUE (student_id, sy_id, month)

### `pace_quarterly_projection` ✅ Created
- `pqp_id`, `student_id` (FK), `sy_id` (FK), `quarter` (1–4), `subject`
- `pace_start`, `pace_end`, `pace_count`
- `status` ('completed' | 'ongoing' | 'not-started')
- UNIQUE (student_id, sy_id, quarter, subject)

### `student_academic_remarks` ✅ Created
- `sar_id`, `student_id` (FK), `sy_id` (FK), `recorded_by` (FK → teacher), `quarter` (1–4)
- `bible_memory_rating`, `reading_wpm`, `supervisor_comments`, `hundreds`
- UNIQUE (student_id, sy_id, quarter)

### `class_academic_summary` ✅ Created
- `cas_id`, `student_id` (FK), `sy_id` (FK), `recorded_by` (FK → teacher), `quarter` (1–4)
- `total_paces`, `cumulative_score`, `count_perfect_100s`, `cumulative_100s`, `average_score`
- `honor_roll_status` ('Honor' | 'High Honor' | 'Highest Honor' | 'None')
- `tardiness_count`, `absence_count`, `demerit_count`, `homework_skip_days`
- `scripture_1st_recited` (boolean), `scripture_2nd_recited` (boolean)
- UNIQUE (student_id, sy_id, quarter)

### `monthly_scripture_assignment` ✅ Created
- `msa_id`, `sy_id` (FK), `principal_id` (FK → principal), `quarter` (1–4), `month` (1–12)
- `scripture_1st` (TEXT), `scripture_2nd` (TEXT)
- UNIQUE (sy_id, month)

---

## Supabase Auth Trigger (Current — as of 2026-05-20)

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role TEXT;
BEGIN
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'student');
  IF v_role NOT IN ('administrator', 'principal', 'teacher', 'student') THEN
    v_role := 'student';
  END IF;
  INSERT INTO public.users (auth_id, username, email, role, is_active, created_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    NEW.email, v_role, true, NOW()
  );
  RETURN NEW;
END;
$function$;
```

Profile table insertion (principal/teacher/administrator) is handled by the service layer, not the trigger.

---

## Removed from Scope

- ❌ `elective_subject_grades` — elective subjects pushed away entirely
- ❌ `student_record_signature` — signatures removed from scope
- ❌ Parent user accounts — parents view via student account; no separate auth
- ❌ ADMIN reviews audit logs feature — ADMIN's access is read-only permission, not a DB relationship

---

## Business Rules (Final, 19 Rules)

1. **USER Supertype/Subtype** — 4 disjoint subtypes (ADMINISTRATOR, PRINCIPAL, TEACHER, STUDENT)
2. **STUDENT parent contacts** — multivalued composite attribute
3–5. **Academic structure** — SCHOOL_YEAR → GRADE_LEVEL → PACE_MODULE
6. **DIAGNOSTIC_ASSESSMENT** — recorded by PRINCIPAL; result is an attribute, not a relationship
7. **STUDENT_PACE** — ternary (STUDENT + PACE_MODULE + TEACHER)
8. **STUDENT_PACE results** — SELF_TEST_RESULT and PACE_TEST_RESULT as weak entities
9. **CHECK_UP_RESULT** — recorded by TEACHER
10. **ATTENDANCE** — ternary (STUDENT + TEACHER, with date as descriptive attribute)
11. **ATTENDANCE_MONTHLY_SUMMARY** — ternary (STUDENT + SCHOOL_YEAR + TEACHER)
12. **PACE_QUARTERLY_PROJECTION** — binary M:N (STUDENT + SCHOOL_YEAR, no teacher)
13. **STUDENT_ACADEMIC_REMARKS** — ternary
14. **CLASS_ACADEMIC_SUMMARY** — ternary
15. **MONTHLY_SCRIPTURE_ASSIGNMENT** — multivalued composite of SCHOOL_YEAR; created by PRINCIPAL
16. **ANNOUNCEMENT** — posted by PRINCIPAL
17. **SYSTEM_AUDIT_LOG** — generated by USER (any subtype)

---

## Principal Pages (All in `/frontend/src/pages/principal/`)

| File | Status | Notes |
|------|--------|-------|
| `PrincipalDashboard.jsx` (in `/pages/`) | ✅ Done | Stat cards, enrollment chart, announcements (removed erroneous Student Monitoring section) |
| `Employees.jsx` | ✅ Done | View Profile modal |
| `Students.jsx` | ✅ Done | Student list + Export button (exports all students for current school year; ⚠️ currently CSV, pending xlsx upgrade) |
| `StudentMonitoring.jsx` | ✅ Done | Roster table; "View Student" opens `StudentProfileModal` |
| `DiagnosticAssessments.jsx` | ✅ Done | Filters by `source === 'diagnostic'` |
| `RecordDiagnostic.jsx` | ✅ Done | 5 subject cards, opens modals |
| `EnglishDiagnosticModal.jsx` | ✅ Done | PACE grid 1001–1096 |
| `SocialScienceDiagnosticModal.jsx` | ✅ Done | 8-row table, shared by SS/Science |
| `Announcements.jsx` | ✅ Done | Create/manage announcements |
| `Reports.jsx` | ✅ Done | Quarter tabs (1st–4th) + Report type tabs (Class Academic Record / Attendance Report / PACE Progress Track); supervisor list with colored avatars; opens correct read-only view modal per active type |
| `ClassAcademicRecordViewModal.jsx` | ✅ Done | Read-only view of teacher's Class Academic Record; "Published" badge; Print + Export PDF; no Acknowledge button |
| `AttendanceReportViewModal.jsx` | ✅ Done | Read-only view of teacher's Attendance Report; student search; P/A/T per month, demerits, HW, elective grades |
| `PaceProgressViewModal.jsx` | ✅ Done | Read-only view of teacher's PACE Progress Track; student search; 8-subject table with PACE ranges, counts, color-coded status |
| `SchoolSections.jsx` | ✅ Done | Section management |
| `Settings.jsx` | ✅ Done | General + Academic tabs, Preferences panel |
| `SecurityAuditLogs.jsx` | ✅ Done | Audit log viewer |
| `AcademicConfiguration.jsx` | ✅ Done | Academic config |

## Shared Components (in `/frontend/src/components/`)

| File | Status | Notes |
|------|--------|-------|
| `StudentProfileModal.jsx` | ✅ Done | Used by both teacher and principal StudentMonitoring; props: `{ student, onClose }`; shows profile block (avatar, name, ID, avg score, PACE stats), 8 subject tabs each with a PACE score table (ScoreCell renders green/orange/gray), attendance summary, PACEs Brought Home table, 100s Achieved table, Supervisor Notes CRUD |

---

## Teacher Pages (All in `/frontend/src/pages/teacher/`)

| File | Status | Notes |
|------|--------|-------|
| `TeacherDashboard.jsx` | ✅ Done | Stat cards, attendance, quick actions, recent activity |
| `PaceMonitoring.jsx` | ✅ Done | Individual View + Class View, quarter filter, status dots |
| `StudentMonitoring.jsx` | ✅ Done | 40+ mock students, roster table, gender badge, pagination; "View Student" opens shared `StudentProfileModal` |
| `Assessments.jsx` | ✅ Done | Single "Record Scores" tab, PACE Test / Self-test / Elective types |
| `Attendance.jsx` | ✅ Done | 32 mock students, colored stat card borders, excused dot |
| `Reports.jsx` | ✅ Done | Operational cards + Report Card Modules + Submitted Reports tabs |
| `AttendanceReportModal.jsx` | ✅ Done | 3-row nested header, P/A/T per month, demerits, HW |
| `PaceProgressModal.jsx` | ✅ Done | Per-subject PACE ranges + counts, color-coded status |
| `StudentIndividualRecordModal.jsx` | ✅ Done | Quarterly PACE table per subject, Bible/WPM, supervisor comments |
| `ClassAcademicRecordModal.jsx` | ✅ Done | 3-row nested header, class stats, scripture recitation flags |
| `AccountSettings.jsx` | ✅ Done | Profile Settings tab + Accessibility tab, Preferences sidebar |

---

## Diagnostic Assessment Feature

### Business Logic
1. Principal → **Diagnostic Assessments** page
2. **New Assessment** → fills student details → student created with `source: 'diagnostic'`
3. Navigates to **Record Diagnostic Data** page (subject cards)
4. Per subject → modal opens → marks learning gaps → enters `start_pace`
5. Saved to `diagnostic_assessment` (one row per subject) with `placement_gl_id` set
6. All 5 subjects done → **Assign PACE Levels** CTA (not yet built)

### Subject Cards (5 total)
- **English** ✅ modal built
- **Social Studies / Science** ✅ modal built (shared modal)
- **Math Beginner** ❓ ranges not yet provided
- **Math Intermediate** ❓ ranges not yet provided
- **Spelling** ❓ ranges not yet provided

### PACE Ranges Known
- **English:** 1001–1096 (12 per row, 8 rows)
- **Social Studies / Science:** 8-row table, pages 1,2,3,4,6,7,8,10; mins: 5,5,4,5,6,6,8,18

---

## Pending / Not Yet Built

- [ ] **Export students as Excel (.xlsx)** — `Students.jsx` Export button currently generates CSV; needs SheetJS (`xlsx` package) to produce a proper Excel file
- [ ] **Math Beginner, Math Intermediate, Spelling modals** — blocked on PACE ranges
- [ ] **Assign PACE Levels page** — `/principal/diagnostic/assign/:studentId`
- [ ] **Teacher read-only diagnostic view** — shows `start_pace` per subject per student
- [ ] **Record Scores** — "Save Score" uses stub, needs real backend wiring
- [ ] **New table models/services/routes** — `attendance_monthly_summary`, `pace_quarterly_projection`, `student_academic_remarks`, `class_academic_summary`, `monthly_scripture_assignment`, `system_audit_log` — tables exist in DB but no backend wiring yet
- [ ] **Wire real data into view modals** — `ClassAcademicRecordViewModal`, `AttendanceReportViewModal`, `PaceProgressViewModal` all use mock data; needs backend API + report submission workflow
- [ ] **Drop old `parent` and `student_parent` tables** — still exist in DB but unused
- [ ] **ERD finalization in Draw.io** — Chen notation, all 19 entities

---

## Common Patterns

### API client
```js
import client from "../../api/client.js";
// axios instance with auth headers
```

### Backend route pattern
```js
router.get("/path", requireRole("principal"), Controller.handler);
// For routes accessible by both: requireRole("principal", "administrator")
// For routes accessible by principal only: requireRole("principal")
```

### Backend response helpers
```js
sendSuccess(res, data);
sendCreated(res, data, "Message");
```

### Supabase model pattern
```js
export const findByStudent = (student_id) =>
  supabaseAdmin.from(TABLE).select("*").eq("student_id", student_id);
```

### asyncHandler
All controller functions wrapped in `asyncHandler` — no try/catch needed in controllers.

---

## UI Conventions

- `fillStyle = { fontVariationSettings: '"FILL" 1' }` — filled Material Symbols icons
- Modal overlay: `fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto`
- Cards: `bg-white rounded-2xl border border-outline-variant/20 shadow-sm`
- Primary button: `bg-primary text-white rounded-xl px-5 py-2.5`
- Publish button: `bg-slate-800 text-white rounded-xl`
- Save Draft: `text-green-600 border border-green-500 rounded-xl`
- Layout component: `PrincipalLayout` (in `components/PrincipalLayout.jsx`)

---

## Errors Encountered & Fixed (Reference)

| Error | Fix |
|-------|-----|
| Smart quotes in JSX string | Use escaped `\"` or regular `"` |
| "Database error creating new user" | Add 4-digit timestamp suffix to email/username |
| "null value in column enrollment_date" | Auto-set `enrollment_date = today` in modal |
| "Objects are not valid as React child" for grade_level | Use `student.grade_level?.level_name` |
| "assessments is not defined" | State renamed to `students`; grep all references |
| Supabase relationship error (grade_level) | Remove grade_level join from diagnostic model |
| Students not showing in diagnostic list | Added `source` column; filter by `source === 'diagnostic'` |
| "Could not find a relationship between diagnostic_assessment and grade_level" | `assigned_level_id` was dropped; remove from model queries |
| `result` check constraint violation | Dropped check constraint; renamed `result` → `start_pace` |
| "null value in column score" | Sum all row score inputs; send as `score` field |
| Settings page header stretching | Changed to `flex items-center justify-between` |
| "Invalid ID number or password" after principal rename | Principal IDs were in 101–149 range; updated to 150–151, advanced sequence to 152 |
| "Forbidden: Insufficient permissions" | `users.role` was `'administrator'` for principals; updated to `'principal'` via SQL |
| "column principal_id can only be updated to DEFAULT" | Column is GENERATED ALWAYS; ran `SET GENERATED BY DEFAULT` first |
| "constraint does not exist" on announcement | Column rename also renamed constraint to `announcement_principal_id_fkey` |

---

## ERD / Business Rules Decisions

| Topic | Decision | Rationale |
|---|---|---|
| PARENT modeling | Multivalued composite attribute of STUDENT | Parents don't have accounts; they view via student account. M:N not needed. |
| USER subtypes | 4 disjoint subtypes (ADMINISTRATOR, PRINCIPAL, TEACHER, STUDENT) | Advisor feedback: use proper supertype/subtype notation |
| ADMINISTRATOR vs PRINCIPAL | Separate roles, separate tables | Different responsibilities (system vs school operations) |
| STUDENT_PACE | Ternary relationship (STUDENT + PACE_MODULE + TEACHER) | All three participants are meaningful per assignment |
| Reporting entities | Keep as separate ternary associative entities | Each has distinct attributes/periodicity; can't collapse without violating 1NF |
| MONTHLY_SCRIPTURE_ASSIGNMENT | Multivalued composite attribute of SCHOOL_YEAR | Simple structure (month + scripture refs); concedes advisor's suggestion |
| ADMIN audit log access | Read-only permission, NOT a DB relationship | ADMIN views logs but doesn't modify them; permission lives in app layer |
| Weak entities | SELF_TEST_RESULT, PACE_TEST_RESULT | Identifying relationship with STUDENT_PACE |
| Diagram tool | Draw.io with Chen notation | Lucidchart shape limit too restrictive for 19 entities |
| Diagnostic recorded by | PRINCIPAL (not teacher, not administrator) | Principal conducts diagnostic assessments for incoming students |

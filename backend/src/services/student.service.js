import * as StudentModel from "../models/student.model.js";
import * as UserModel from "../models/user.model.js";
import * as StudentParentContactModel from "../models/studentParentContact.model.js";
import * as NotificationService from "./notification.service.js";
import { supabase, supabaseAdmin } from "../config/supabase.js";
import { describeAuthCreateError } from "../helpers/authErrors.js";
import { getEligibleUserIds, getSchoolYear, setAccountActive } from "./schoolYearStatus.service.js";
import { addAttendanceCredits } from "../helpers/attendanceCredits.js";

// School wall-clock timezone. PACE test schedules are stored as real instants
// anchored to the school offset (see teacher.service.js SCHOOL_TZ_OFFSET), so
// they must be formatted back in this zone — not UTC — to show the time the
// supervisor actually entered (e.g. 8:54 AM, not 12:54 AM).
const SCHOOL_TZ = "Asia/Manila";
const SELF_TEST_PASS_MARK = 80;
const PACE_TEST_PASS_MARK = 90;
const PACE_TEST_MAX_ATTEMPTS = 3;
const PACE_SUBJECT_ORDER = [
  "English",
  "Mathematics",
  "Science",
  "Word Building",
  "Filipino",
  "Sibika at Kultura/Heograpiya Kasaysayan at Sibika",
  "Literature and Creative Writing",
];

// ── PACE projection helpers (source of truth: pace_quarterly_projection) ──────

/** Derive an overall status for a subject/quarter row from its 3 status slots */
function deriveSubjectStatus(proj) {
  if (!proj) return "not-started";
  const statuses = [proj.status_r0, proj.status_r1, proj.status_r2];
  if (statuses.every((s) => s === "completed")) return "completed";
  if (statuses.every((s) => !s || s === "not-started")) return "not-started";
  return "ongoing";
}

/** Format a "PACE 13–18" style label from a projection row */
function paceRange(proj) {
  if (!proj?.pace_start) return "—";
  const end = proj.pace_end ?? (proj.pace_start + (proj.pace_count ?? 1) - 1);
  return end > proj.pace_start ? `PACE ${proj.pace_start}–${end}` : `PACE ${proj.pace_start}`;
}

async function getActiveSchoolYearId() {
  const { data } = await supabaseAdmin
    .from("school_year")
    .select("sy_id")
    .eq("is_active", true)
    .maybeSingle();
  return data?.sy_id ?? null;
}

function getCurrentSchoolYearQuarter(startDate) {
  if (!startDate) return 1;
  const start = new Date(startDate);
  const now = new Date();
  const months = (now.getFullYear() - start.getFullYear()) * 12
    + (now.getMonth() - start.getMonth());
  return Math.min(4, Math.max(1, Math.floor(months / 3) + 1));
}

// ── Student ID generation ─────────────────────────────────────────────────────
// New student IDs use the format YYNN: YY = last two digits of the year the student
// ENROLLED (from their enrollment_date), NN = an incrementing 2-digit sequence
// within that year. e.g. enrolled 2026, first student -> 2601, next -> 2602, ...
// The number is assigned at creation and locked in (never renumbered), so it is
// safe to use as the login identity. NOTE: 2 digits caps a year at 99 students
// (the 100th would roll into the next year's block).
async function generateNextStudentId(enrollmentDate) {
  // Year comes from the student's enrollment date; fall back to the current year.
  const parsed = enrollmentDate ? new Date(enrollmentDate) : new Date();
  const year   = isNaN(parsed) ? new Date().getFullYear() : parsed.getFullYear();

  const yy   = year % 100;   // 2026 -> 26
  const base = yy * 100;     // 2600 -> block 2601..2699

  // Highest ID already assigned in this year's block; next = that + 1.
  const { data: rows, error } = await supabaseAdmin
    .from("student")
    .select("student_id")
    .gte("student_id", base + 1)
    .lt("student_id", base + 100)
    .order("student_id", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);

  return rows && rows.length ? Number(rows[0].student_id) + 1 : base + 1;
}

async function getPaceProjectionRows(student_id, sy_id) {
  if (!sy_id) return [];
  const { data } = await supabaseAdmin
    .from("pace_quarterly_projection")
    .select("subject, quarter, pace_start, pace_end, pace_count, status_r0, status_r1, status_r2, recorded_by")
    .eq("student_id", student_id)
    .eq("sy_id", sy_id)
    .order("quarter");
  return data ?? [];
}

/** Build a teacher_id → "First Last" lookup for the given recorded_by ids */
async function getTeacherNamesByIds(teacherIds) {
  const ids = [...new Set(teacherIds.filter((id) => id != null))];
  const map = new Map();
  if (!ids.length) return map;
  const { data } = await supabaseAdmin
    .from("teacher")
    .select("teacher_id, first_name, last_name")
    .in("teacher_id", ids);
  (data ?? []).forEach((t) => map.set(t.teacher_id, `${t.first_name} ${t.last_name}`.trim()));
  return map;
}

/** Friendly remark based on a final score */
function paceRemark(score) {
  if (!score) return "—";
  // 90 is the pass mark: passing = "Excellent performance", failing = "Needs improvement".
  return score >= 90 ? "Excellent performance." : "Needs improvement.";
}

/**
 * Resolve a projection slot's effective status. Completion comes only from a
 * recorded passing official PACE test (represented by completedKeys). A raw
 * projection "completed" value without that test is treated as still ongoing.
 */
function effectiveSlotStatus(subject, paceNo, rawStatus, completedKeys) {
  if (paceNo != null && completedKeys.has(`${subject}::${paceNo}`)) return "completed";
  if (rawStatus === "completed") return "ongoing";
  return rawStatus ?? "not-started";
}

/** Count individual PACE slots (status_r0/r1/r2 across all rows) by bucket */
function summarizePaceSlots(rows, completedKeys = new Set()) {
  let completed = 0, ongoing = 0, remaining = 0;
  rows.forEach((r) => {
    [r.status_r0, r.status_r1, r.status_r2].forEach((s, i) => {
      const paceNo = r.pace_start != null ? r.pace_start + i : null;
      const status = effectiveSlotStatus(r.subject, paceNo, s, completedKeys);
      if (status === "completed") completed++;
      else if (!status || status === "not-started") remaining++;
      else ongoing++; // ongoing, taken-home, needs-next, etc.
    });
  });
  // Completion rate = completed slots / every planned slot, as a whole percent.
  // The denominator is the PLAN, not the work done: 3 slots per pace_quarterly_projection row
  // (status_r0/r1/r2) across all 4 quarters and all subjects, so it reads as "percent of the
  // year's PACEs finished so far" and only hits 100 once the whole projection is completed.
  // A student with no projection rows yet gets 0, not a blank.
  const total = completed + ongoing + remaining;
  const completionRate = total ? Math.round((completed / total) * 100) : 0;
  return { completed, ongoing, remaining, completionRate };
}

export const getAllStudents = async () => {
  const activeSy = await getSchoolYear();
  const eligible = await getEligibleUserIds(activeSy.sy_id, "student");
  const { data, error } = await StudentModel.findAll();
  if (error) throw new Error(error.message);
  return (data ?? []).filter((student) => eligible.has(student.user_id ?? student.users?.user_id));
};

export const getStudentById = async (student_id) => {
  const { data, error } = await StudentModel.findById(student_id);
  if (error) throw new Error("Student not found");
  return data;
};

export const getStudentByUserId = async (user_id) => {
  const { data, error } = await StudentModel.findByUserId(user_id);
  if (error) throw new Error("Student not found");
  return data;
};

export const createStudent = async (authPayload, profilePayload, extras = {}, changed_by = null) => {
  // Duplicate-person guard. The login email is auto-uniquified below (a repeat
  // name just gets the ID appended), so the users.email UNIQUE constraint no
  // longer blocks enrolling the same person twice. Guard here instead: reject a
  // new student when an ACTIVE student already has the same first + last name.
  // Deactivated students are allowed through so a genuine re-enrolment can go on.
  const nameKey = (s) => String(s ?? "").toLowerCase().trim().replace(/\s+/g, " ");
  const fnNew = nameKey(profilePayload.first_name);
  const lnNew = nameKey(profilePayload.last_name);
  if (fnNew && lnNew) {
    const { data: sameName } = await supabaseAdmin
      .from("student")
      .select("student_id, first_name, last_name, grade_level(level_name), users(is_active)")
      .ilike("first_name", profilePayload.first_name.trim())
      .ilike("last_name", profilePayload.last_name.trim());
    const clash = (sameName ?? []).find(
      (s) =>
        nameKey(s.first_name) === fnNew &&
        nameKey(s.last_name) === lnNew &&
        s.users?.is_active !== false, // treat missing/true as active
    );
    if (clash) {
      const grade = clash.grade_level?.level_name ? ` in ${clash.grade_level.level_name}` : "";
      const err = new Error(
        `A student named ${profilePayload.first_name.trim()} ${profilePayload.last_name.trim()} already exists (ID ${clash.student_id}${grade}). ` +
        `If this is a different person, add a distinguishing detail; otherwise edit the existing record instead of creating a new one.`,
      );
      err.statusCode = 409; // Conflict — a validation rejection, not a server fault
      throw err;
    }
  }

  // Assign the formatted student ID (YYNN). YY = enrollment year. This stays the
  // student's LOGIN ID — they sign in with the number (login looks the account up
  // by student_id).
  const newStudentId = await generateNextStudentId(profilePayload.enrollment_date);

  // Auth email is name-based for readability: firstname.lastname@lca.edu.
  // users.email is UNIQUE, so append the student ID if that base is already taken.
  const norm = (s) => String(s ?? "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "");
  const nameBase = `${norm(profilePayload.first_name)}.${norm(profilePayload.last_name)}`.replace(/^\.+|\.+$/g, "") || `student.${newStudentId}`;
  let loginEmail = `${nameBase}@lca.edu`;
  const { data: emailTaken } = await supabaseAdmin
    .from("users").select("user_id").eq("email", loginEmail).maybeSingle();
  if (emailTaken) loginEmail = `${nameBase}.${newStudentId}@lca.edu`;

  // Username stays the student ID number (the login identifier); email is name-based.
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: loginEmail,
    password: authPayload.password,
    email_confirm: true,
    user_metadata: {
      username: String(newStudentId),
      role: "student",
    },
  });

  if (authError) throw new Error(describeAuthCreateError(authError));

  const { data: userProfile, error: userError } = await UserModel.findByAuthId(authData.user.id);
  if (userError) {
    // Roll back: drop the users row (trigger-created) then the auth user.
    await supabaseAdmin.from("users").delete().eq("auth_id", authData.user.id);
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
    throw new Error("Failed to retrieve user profile after creation.");
  }

  const { data, error } = await StudentModel.create({
    ...profilePayload,
    student_id: newStudentId,
    user_id: userProfile.user_id,
  });

  if (error) {
    // Roll back the trigger-created users row too, so no orphan blocks retries.
    await supabaseAdmin.from("users").delete().eq("user_id", userProfile.user_id);
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
    throw new Error(error.message);
  }

  // Keep the users row consistent: name-based email + student-ID username.
  await supabaseAdmin
    .from("users")
    .update({ email: loginEmail, username: String(newStudentId) })
    .eq("user_id", userProfile.user_id);

  // Optionally mark the student's user account inactive at creation
  if (extras.is_active === false) {
    await setAccountActive(userProfile.user_id, false, changed_by, "Student created as inactive");
  }

  // Optionally store a parent/guardian contact for the student. If this fails
  // (e.g. the table hasn't been migrated yet), roll back so we don't leave a
  // half-created student behind.
  const pc = extras.parentContact;
  if (pc && pc.parent_name) {
    const { error: pcError } = await StudentParentContactModel.create({
      student_id:              data.student_id,
      parent_name:             pc.parent_name,
      contact_number:          pc.contact_number ?? null,
      email:                   pc.email ?? null,
      relationship_to_student: pc.relationship_to_student ?? null,
    });
    if (pcError) {
      await StudentModel.remove(data.student_id);
      await supabaseAdmin.from("users").delete().eq("user_id", userProfile.user_id);
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      throw new Error(`Failed to save parent/guardian contact: ${pcError.message}`);
    }
  }

  // Surface the generated login email so the UI can show the real credentials.
  return { ...data, login_email: loginEmail };
};

export const updateStudent = async (student_id, payload, changed_by = null) => {
  const { is_active, ...studentFields } = payload;
  const { data, error } = await StudentModel.update(student_id, studentFields);
  if (error) throw new Error(error.message);

  if (typeof is_active === "boolean") {
    const { data: student, error: findErr } = await supabaseAdmin
      .from("student")
      .select("user_id")
      .eq("student_id", Number(student_id))
      .single();
    if (findErr || !student) throw new Error("Student account not found.");
    await setAccountActive(student.user_id, is_active, changed_by, "Status changed from student profile");
  }
  return data;
};

// Limited edit used by the teacher's Assign Pace page (principal may use it too).
// Whitelisted fields only; teachers can only edit their own students.
const STUDENT_INFO_FIELDS = ["first_name", "last_name", "date_of_birth", "gender"];

export const patchStudentInfo = async (student_id, payload, requestingUser) => {
  const fields = {};
  STUDENT_INFO_FIELDS.forEach((f) => {
    if (payload[f] !== undefined && payload[f] !== "") fields[f] = payload[f];
  });
  if (!Object.keys(fields).length) throw new Error("No editable fields provided");

  if (requestingUser.role === "teacher") {
    const { data: teacher } = await supabaseAdmin
      .from("teacher")
      .select("teacher_id")
      .eq("user_id", requestingUser.user_id)
      .maybeSingle();
    if (!teacher) throw new Error("Teacher profile not found");

    const { data: owned } = await supabaseAdmin
      .from("student")
      .select("student_id, grade_level!inner(teacher_id)")
      .eq("student_id", student_id)
      .eq("grade_level.teacher_id", teacher.teacher_id)
      .maybeSingle();
    if (!owned) throw new Error("Student not found or not assigned to this teacher");
  }

  const { data, error } = await StudentModel.update(student_id, fields);
  if (error) throw new Error(error.message);
  return data;
};

export const deleteStudent = async (student_id) => {
  const { data: student, error: findError } = await StudentModel.findById(student_id);
  if (findError || !student) throw new Error("Student not found");

  const { data: userProfile } = await UserModel.findById(student.user_id);

  const { error } = await StudentModel.remove(student_id);
  if (error) throw new Error(error.message);

  if (userProfile?.auth_id) {
    await supabaseAdmin.auth.admin.deleteUser(userProfile.auth_id);
  }
};

export const linkParent = async (student_id, parent_id, is_primary_contact = false) => {
  const { data, error } = await supabaseAdmin
    .from("student_parent")
    .insert({ student_id, parent_id, is_primary_contact })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
};


export const getStudentSettings = async (user_id) => {
  const { data: student, error: studentErr } = await supabaseAdmin
    .from("student")
    .select("student_id, first_name, last_name")
    .eq("user_id", user_id)
    .single();
  if (studentErr) throw new Error(studentErr.message);

  const { data: userProfile, error: userErr } = await supabaseAdmin
    .from("users")
    .select("email, auth_id")
    .eq("user_id", user_id)
    .single();
  if (userErr) throw new Error(userErr.message);

  const { data: diag } = await supabaseAdmin
    .from("diagnostic_assessment")
    .select("grade_level(level_name)")
    .eq("student_id", student.student_id)
    .order("diag_id", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    first_name: student.first_name,
    last_name:  student.last_name,
    email:      userProfile.email,
    grade:      diag?.grade_level?.level_name ?? null,
    section:    null,
    emergency_contact: null,
  };
};

export const updateStudentProfile = async (user_id, { first_name, last_name }) => {
  const { data: student, error: findErr } = await supabaseAdmin
    .from("student")
    .select("student_id")
    .eq("user_id", user_id)
    .single();
  if (findErr) throw new Error(findErr.message);

  const { data, error } = await supabaseAdmin
    .from("student")
    .update({ first_name, last_name })
    .eq("student_id", student.student_id)
    .select("student_id, first_name, last_name")
    .single();
  if (error) throw new Error(error.message);
  return data;
};

export const updateStudentEmail = async (user_id, { newEmail }) => {
  const { data: userProfile, error: userErr } = await supabaseAdmin
    .from("users")
    .select("auth_id")
    .eq("user_id", user_id)
    .single();
  if (userErr) throw new Error(userErr.message);

  const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(userProfile.auth_id, {
    email:         newEmail,
    email_confirm: true,
  });
  if (authErr) throw new Error(authErr.message);

  await supabaseAdmin.from("users").update({ email: newEmail }).eq("user_id", user_id);

  return { email: newEmail };
};

export const changeStudentPassword = async (user_id, { currentPassword, newPassword }) => {
  const { data: userProfile, error: userErr } = await supabaseAdmin
    .from("users")
    .select("email, auth_id")
    .eq("user_id", user_id)
    .single();
  if (userErr) throw new Error(userErr.message);

  // Verify current password by attempting sign-in
  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email:    userProfile.email,
    password: currentPassword,
  });
  if (signInErr) throw new Error("Current password is incorrect.");

  const { error } = await supabaseAdmin.auth.admin.updateUserById(userProfile.auth_id, {
    password: newPassword,
  });
  if (error) throw new Error(error.message);
};

export const getStudentAnnouncements = async (user_id) => {
  const { data: student } = await supabaseAdmin
    .from("student")
    .select("first_name")
    .eq("user_id", user_id)
    .single();

  const { data, error } = await supabaseAdmin
    .from("announcement")
    .select("ann_id, title, content, posted_date, audience_role")
    .eq("is_active", true)
    .or("audience_role.eq.All,audience_role.eq.Student")
    .order("posted_date", { ascending: false });

  if (error) throw new Error(error.message);

  const formatDateTime = (raw) => {
    if (!raw) return "—";
    const d = new Date(raw);
    const date = d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    return `${date} • ${time}`;
  };

  return {
    student:       { first_name: student?.first_name ?? null },
    announcements: (data ?? []).map((a) => ({
      id:       a.ann_id,
      title:    a.title,
      content:  a.content ?? "",
      category: a.audience_role ?? "General",
      postedAt: formatDateTime(a.posted_date),
    })),
  };
};

export const getStudentAttendance = async (user_id, monthParam) => {
  const { data: student, error: studentErr } = await supabaseAdmin
    .from("student")
    .select("student_id, first_name, last_name, grade_level(level_name)")
    .eq("user_id", user_id)
    .maybeSingle();
  if (studentErr) throw new Error(studentErr.message);
  if (!student) throw new Error("Student profile not found");

  // Month options span the active school year
  const { data: sy } = await supabaseAdmin
    .from("school_year")
    .select("sy_id, start_date, end_date")
    .eq("is_active", true)
    .maybeSingle();

  const months = [];
  if (sy?.start_date && sy?.end_date) {
    const cur = new Date(sy.start_date);
    cur.setDate(1);
    const end = new Date(sy.end_date);
    while (cur <= end) {
      months.push({
        value: `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`,
        label: cur.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
      });
      cur.setMonth(cur.getMonth() + 1);
    }
  }

  // Selected month: ?month=YYYY-MM, defaulting to the current month clamped into the SY range
  const now      = new Date();
  const nowValue = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  let selected   = /^\d{4}-\d{2}$/.test(monthParam ?? "") ? monthParam : nowValue;
  if (months.length && !months.some((m) => m.value === selected)) {
    selected = selected < months[0].value ? months[0].value : months[months.length - 1].value;
  }

  const [yearNum, monthNum] = selected.split("-").map(Number);
  const lastDay    = new Date(yearNum, monthNum, 0).getDate();
  const monthStart = `${selected}-01`;
  const monthEnd   = `${selected}-${String(lastDay).padStart(2, "0")}`;

  const { data: recs, error: attErr } = await supabaseAdmin
    .from("attendance")
    .select("date_recorded, session, status, notes")
    .eq("student_id", student.student_id)
    .gte("date_recorded", monthStart)
    .lte("date_recorded", monthEnd)
    .order("date_recorded");
  if (attErr) throw new Error(attErr.message);

  const byDate = new Map();
  (recs ?? []).forEach((record) => {
    const date = String(record.date_recorded).slice(0, 10);
    const sessions = byDate.get(date) ?? {};
    sessions[record.session === "PM" ? "pm" : "am"] = record;
    byDate.set(date, sessions);
  });

  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const normalizeStatus = (s) => {
    const t = (s || "").toLowerCase();
    if (t === "present")                return "Present";
    if (t === "late" || t === "tardy")  return "Late";
    if (t === "absent")                 return "Absent";
    if (t === "excused")                return "Excused";
    return s || "—";
  };
  const DEFAULT_REMARKS = {
    Present: "Regular School Day",
    Late:    "Arrived Late",
    Absent:  "Unexcused",
    Excused: "Excused",
  };

  // Every calendar day of the month up to today: recorded days show their
  // status, weekends and unrecorded weekdays show "No Class"
  const records = [];
  for (let d = 1; d <= lastDay; d++) {
    const iso = `${selected}-${String(d).padStart(2, "0")}`;
    if (iso > todayStr) break;
    const dt      = new Date(yearNum, monthNum - 1, d);
    const dow     = dt.getDay();
    const dayName = dt.toLocaleDateString("en-US", { weekday: "long" });
    const rec     = byDate.get(iso);

    if (rec) {
      const amStatus = normalizeStatus(rec.am?.status);
      const pmStatus = normalizeStatus(rec.pm?.status);
      const notes = [rec.am?.notes, rec.pm?.notes].map((note) => note?.trim()).filter(Boolean);
      records.push({
        date:    iso,
        day:     dayName,
        am_status: amStatus,
        pm_status: pmStatus,
        remarks: notes.length ? [...new Set(notes)].join(" / ") : [amStatus, pmStatus]
          .filter((status) => status !== "—")
          .map((status) => DEFAULT_REMARKS[status] ?? "")
          .filter(Boolean)
          .join(" / "),
        noClass: false,
      });
    } else {
      const isWeekend = dow === 0 || dow === 6;
      records.push({
        date:    iso,
        day:     dayName,
        am_status: "No Class",
        pm_status: "No Class",
        remarks: isWeekend ? "Weekend" : "No school held",
        noClass: true,
      });
    }
  }

  // Stats for the selected month: school days = days with a record
  const recorded = records.filter((r) => !r.noClass);
  const credits = (recs ?? []).reduce(
    (totals, record) => addAttendanceCredits(totals, record.status),
    { present: 0, absent: 0, tardy: 0, excused: 0 },
  );
  const { present, absent, excused } = credits;
  const late = credits.tardy;
  const schoolDays = recorded.length;
  const attendanceRate = schoolDays
    ? Math.round((present / schoolDays) * 1000) / 10
    : 0;

  return {
    student: {
      student_id:  student.student_id,
      first_name:  student.first_name,
      last_name:   student.last_name,
      grade_level: student.grade_level?.level_name ?? null,
    },
    months,
    selectedMonth: selected,
    stats: { schoolDays, present, late, absent, excused, attendanceRate },
    records,
  };
};

export const getStudentGrades = async (user_id, quarter) => {
  const [{ data: student, error: studentErr }, { data: schoolYear, error: schoolYearError }] = await Promise.all([
    supabaseAdmin
      .from("student")
      .select("student_id, first_name, last_name, gl_id, grade_level(level_name)")
      .eq("user_id", user_id)
      .single(),
    supabaseAdmin
      .from("school_year")
      .select("sy_id, year_label, start_date")
      .eq("is_active", true)
      .maybeSingle(),
  ]);
  if (studentErr) throw new Error(studentErr.message);
  if (schoolYearError) throw new Error(schoolYearError.message);

  const student_id = student.student_id;
  const sy_id = schoolYear?.sy_id ?? null;
  const gradeLevel = student.grade_level ?? null;
  const requestedQuarter = Number(quarter);
  const q = [1, 2, 3, 4].includes(requestedQuarter)
    ? requestedQuarter
    : getCurrentSchoolYearQuarter(schoolYear?.start_date);

  // Load all independent grade inputs together. The previous implementation
  // fetched each of these serially, which made a quarter change wait on several
  // network round trips before score processing could begin.
  const [projectionRows, studentPaceResult, peerResult, remarkResult] = await Promise.all([
    sy_id ? getPaceProjectionRows(student_id, sy_id) : Promise.resolve([]),
    supabaseAdmin
      .from("student_pace")
      .select("sp_id, points_earned, status, pace_module(subject, module_number)")
      .eq("student_id", student_id),
    student.gl_id
      ? supabaseAdmin.from("student").select("student_id").eq("gl_id", student.gl_id)
      : Promise.resolve({ data: [], error: null }),
    sy_id
      ? supabaseAdmin
          .from("student_academic_remarks")
          .select("quarter, bible_memory_rating, reading_wpm, supervisor_comments")
          .eq("student_id", student_id)
          .eq("sy_id", sy_id)
          .order("quarter", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (studentPaceResult.error) throw new Error(studentPaceResult.error.message);
  if (peerResult.error) throw new Error(peerResult.error.message);
  if (remarkResult.error) throw new Error(remarkResult.error.message);
  const rows = projectionRows.filter((row) => row.quarter === q);
  const studentPaces = studentPaceResult.data ?? [];
  const peers = peerResult.data ?? [];
  const remarks = remarkResult.data ?? [];

  // Score lookups: subject::moduleNumber → sp_id → [scores]

  const spIdByModuleKey = new Map();
  (studentPaces ?? []).forEach((p) => {
    const subject = p.pace_module?.subject;
    const moduleNumber = p.pace_module?.module_number;
    if (subject == null || moduleNumber == null) return;
    spIdByModuleKey.set(`${subject}::${moduleNumber}`, p.sp_id);
  });

  // Score per PACE. Each PACE number maps to exactly one quarter via the
  // projection, so we match by sp_id rather than the pace_test_result.quarter
  // column (which the supervisor's recording flow may leave null). If a PACE has
  // multiple recordings the latest one wins (re-saving is a correction).
  const spIds = [...new Set(spIdByModuleKey.values())];
  const peerIds = peers.map((peer) => peer.student_id);
  const scoreBySpId = new Map(); // sp_id → latest { score, date_taken }
  const attemptsBySpId = new Map(); // sp_id → all scored attempts
  const [scoreResult, peerPaceResult] = await Promise.all([
    spIds.length
      ? supabaseAdmin
          .from("pace_test_result")
          .select("sp_id, score, passed, date_taken")
          .in("sp_id", spIds)
          .not("score", "is", null)
      : Promise.resolve({ data: [], error: null }),
    peerIds.length
      ? supabaseAdmin
          .from("student_pace")
          .select("student_id, points_earned, status")
          .in("student_id", peerIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (scoreResult.error) throw new Error(scoreResult.error.message);
  if (peerPaceResult.error) throw new Error(peerPaceResult.error.message);
  const allPaceResults = scoreResult.data ?? [];
  const peerPaces = peerPaceResult.data ?? [];
  allPaceResults.forEach((r) => {
      const attempts = attemptsBySpId.get(r.sp_id) ?? [];
      attempts.push(r);
      attemptsBySpId.set(r.sp_id, attempts);
      const prev = scoreBySpId.get(r.sp_id);
      if (!prev || String(r.date_taken ?? "") >= String(prev.date_taken ?? "")) {
        scoreBySpId.set(r.sp_id, { score: r.score, date_taken: r.date_taken });
      }
  });

  const scoreFor = (subject, paceNo) => {
    const spId = spIdByModuleKey.get(`${subject}::${paceNo}`);
    const rec  = spId != null ? scoreBySpId.get(spId) : null;
    return rec != null ? Math.round(rec.score) : null;
  };
  const terminallyFailed = (subject, paceNo) => {
    const spId = spIdByModuleKey.get(`${subject}::${paceNo}`);
    const attempts = spId != null ? (attemptsBySpId.get(spId) ?? []) : [];
    const passed = attempts.some(
      (attempt) => attempt.passed === true || Number(attempt.score) >= PACE_TEST_PASS_MARK,
    );
    return !passed && attempts.length >= PACE_TEST_MAX_ATTEMPTS;
  };

  let completedSlots = 0;
  let totalSlots = 0;

  const orderedRows = [...rows].sort((a, b) => {
    const aIndex = PACE_SUBJECT_ORDER.indexOf(a.subject);
    const bIndex = PACE_SUBJECT_ORDER.indexOf(b.subject);
    const aOrder = aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex;
    const bOrder = bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex;
    return aOrder - bOrder || a.subject.localeCompare(b.subject);
  });
  const subjects = orderedRows.map((r) => {
    const paceNumbers = [0, 1, 2].map((i) => (r.pace_start != null ? r.pace_start + i : null));
    const paceScores  = paceNumbers.map((paceNo) => (paceNo != null ? scoreFor(r.subject, paceNo) : null));

    [r.status_r0, r.status_r1, r.status_r2].forEach((_, index) => {
      totalSlots++;
      if (paceScores[index] != null && paceScores[index] >= 90) completedSlots++;
    });

    const validScores = paceScores.filter((s) => s != null);
    const quarterAverage = validScores.length
      ? Math.round((validScores.reduce((a, b) => a + b, 0) / validScores.length) * 10) / 10
      : null;
    const hasTerminalFailure = paceNumbers.some(
      (paceNo) => paceNo != null && terminallyFailed(r.subject, paceNo),
    );

    return {
      subject: r.subject,
      paceNumbers,
      paceScores,
      quarterAverage,
      // PACE standard: 90 and above is Passed (matches the teacher's PACE Test modal)
      passed: hasTerminalFailure ? false : quarterAverage != null ? quarterAverage >= 90 : null,
      status: hasTerminalFailure ? "Failed" : quarterAverage != null ? quarterAverage >= 90 ? "Passed" : "Failed" : null,
    };
  });

  const subjectAverages = subjects.map((s) => s.quarterAverage).filter((v) => v != null);
  const generalAverage = subjectAverages.length
    ? Math.round((subjectAverages.reduce((a, b) => a + b, 0) / subjectAverages.length) * 10) / 10
    : null;

  const overallRemark = generalAverage == null
    ? "—"
    : generalAverage >= 90 ? "Outstanding"
    : generalAverage >= 85 ? "Very Satisfactory"
    : generalAverage >= 80 ? "Satisfactory"
    : generalAverage >= 75 ? "Fairly Satisfactory"
    : "Did Not Meet Expectations";

  // ── Academic Standing card ────────────────────────────────────────────────
  // Reuse the PACE and score rows already loaded above instead of querying them again.
  const performancePoints = studentPaces.reduce((sum, pace) => sum + (pace.points_earned ?? 0), 0);

  // Overall average across ALL of the student's PACE tests (all-time, all subjects)
  const allScores = allPaceResults.map((result) => result.score).filter((score) => score != null);
  const overallAverage = allScores.length
    ? Math.round((allScores.reduce((sum, score) => sum + score, 0) / allScores.length) * 10) / 10
    : null;

  // Rank (by performance points) + PACE-completion percentile among grade peers
  let currentRank = null, totalInGrade = 0, completionPercentile = null, completionRankLabel = "—";
  if (student.gl_id) {
    totalInGrade = peerIds.length;
    if (peerIds.length) {
      const ptsBy = new Map(peerIds.map((id) => [id, 0]));
      const compBy = new Map(peerIds.map((id) => [id, 0]));
      peerPaces.forEach((p) => {
        ptsBy.set(p.student_id, (ptsBy.get(p.student_id) ?? 0) + (p.points_earned ?? 0));
        if (String(p.status ?? "").toLowerCase() === "completed") {
          compBy.set(p.student_id, (compBy.get(p.student_id) ?? 0) + 1);
        }
      });
      const byPoints = [...ptsBy.entries()].sort((a, b) => b[1] - a[1]);
      currentRank = byPoints.findIndex(([id]) => id === student_id) + 1 || null;
      const byComp = [...compBy.entries()].sort((a, b) => b[1] - a[1]);
      const compRank = byComp.findIndex(([id]) => id === student_id) + 1;
      if (compRank > 0) {
        completionPercentile = Math.max(1, Math.ceil((compRank / totalInGrade) * 100));
        completionRankLabel = `Top ${completionPercentile}%`;
      }
    }
  }

  // Bible memory / reading WPM / supervisor comments for the quarter
  let bibleMemory = null, readingWpm = null, supervisorComments = null, remarksQuarter = null;
  if (sy_id) {
    // Prefer the selected quarter. If it has no evaluation yet, keep the grade
    // table on that quarter and show the latest evaluation from the same SY.
    const remark = (remarks ?? []).find((row) => Number(row.quarter) === q)
      ?? (remarks ?? [])[0]
      ?? null;
    bibleMemory        = remark?.bible_memory_rating ?? null;
    readingWpm         = remark?.reading_wpm ?? null;
    supervisorComments = remark?.supervisor_comments ?? null;
    remarksQuarter     = remark?.quarter != null ? Number(remark.quarter) : null;
  }

  return {
    student: {
      first_name: student.first_name,
      last_name:  student.last_name,
      lrn:        null,
    },
    gradeLevel:         gradeLevel?.level_name ?? null,
    schoolYear:         schoolYear?.year_label ?? null,
    quarter:            q,
    subjects,
    generalAverage,
    overallRemark,
    pacesCompleted:     completedSlots,
    pacesTotal:         totalSlots,
    academicStanding: {
      overallAverage,
      performancePoints,
      currentRank,
      totalInGrade,
      completionPercentile,
      completionRankLabel,
    },
    bibleMemory,
    readingWpm,
    supervisorComments,
    remarksQuarter,
  };
};

export const getStudentAssessments = async (user_id) => {
  const { data: student, error: studentErr } = await supabaseAdmin
    .from("student")
    .select("student_id, first_name, last_name")
    .eq("user_id", user_id)
    .single();
  if (studentErr) throw new Error(studentErr.message);

  const { data: paces, error: pacesErr } = await supabaseAdmin
    .from("student_pace")
    .select("sp_id, pace_module(subject, module_number)")
    .eq("student_id", student.student_id);
  if (pacesErr) throw new Error(pacesErr.message);

  const spIds = (paces ?? []).map((p) => p.sp_id);
  const subjectBySpId  = {};
  const paceNoBySpId   = {};
  (paces ?? []).forEach((p) => {
    subjectBySpId[p.sp_id] = p.pace_module?.subject ?? "—";
    paceNoBySpId[p.sp_id]  = p.pace_module?.module_number ?? null;
  });

  const toDate = (raw) =>
    raw
      ? new Date(raw).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
      : "—";

  const [checkUps, selfTests, paceTests] = await Promise.all([
    supabaseAdmin
      .from("check_up_result")
      .select("sp_id, attempt_number, score, date_taken")
      .in("sp_id", spIds)
      .order("date_taken", { ascending: false }),
    supabaseAdmin
      .from("self_test_result")
      .select("sp_id, score, date_taken, passed, notes")
      .in("sp_id", spIds)
      .order("date_taken", { ascending: false }),
    supabaseAdmin
      .from("pace_test_result")
      .select("sp_id, score, date_taken, passed, notes")
      .in("sp_id", spIds)
      .not("score", "is", null)   // exclude not-yet-taken request/schedule rows
      .order("date_taken", { ascending: false }),
  ]);

  // Collapse a PACE's attempts (self-test or PACE-test) into ONE row showing the
  // BEST (highest) attempt's score, not the average. Readiness is "any attempt >=
  // the relevant pass mark, so the best attempt is the score of record — this matches the supervisor's
  // self-test score column (which also takes the highest attempt per PACE). Date =
  // the best attempt's date.
  const bestBySp = (results, passMark) => {
    const bySp = new Map();
    (results ?? []).forEach((r) => {
      if (r.score == null) return;
      const cur = bySp.get(r.sp_id);
      if (!cur || r.score > cur.score) bySp.set(r.sp_id, r);
    });
    return [...bySp.entries()]
      .map(([sp_id, r]) => {
        const score = Math.round(r.score * 10) / 10;
        return {
          subject:      subjectBySpId[sp_id] ?? "—",
          paceNumber:   paceNoBySpId[sp_id] ?? null,
          score,
          dateTaken:    toDate(r.date_taken),
          dateTakenRaw: r.date_taken ?? null,
          passed:       score >= passMark,
          remarks:      paceRemark(score),
        };
      })
      .sort((a, b) => a.subject.localeCompare(b.subject) || (a.paceNumber ?? 0) - (b.paceNumber ?? 0));
  };

  return {
    student,
    checkUpResults: (checkUps.data ?? []).map((r) => ({
      subject:   subjectBySpId[r.sp_id] ?? "—",
      attempt:   r.attempt_number,
      score:     r.score,
      dateTaken: toDate(r.date_taken),
    })),
    selfTestResults: bestBySp(selfTests.data, SELF_TEST_PASS_MARK),
    paceTestResults: bestBySp(paceTests.data, PACE_TEST_PASS_MARK),
  };
};

export const getStudentPace = async (user_id) => {
  const { data: student, error: studentErr } = await supabaseAdmin
    .from("student")
    .select("student_id, first_name, last_name")
    .eq("user_id", user_id)
    .single();
  if (studentErr) throw new Error(studentErr.message);

  const student_id = student.student_id;
  const sy_id = await getActiveSchoolYearId();
  const rows  = await getPaceProjectionRows(student_id, sy_id);

  // Final scores per individual PACE module — from pace_test_result via student_pace
  const { data: studentPaces } = await supabaseAdmin
    .from("student_pace")
    .select("sp_id, status, assigned_date, end_date, completion_date, pace_module(subject, module_number)")
    .eq("student_id", student_id);

  const subjectByModuleKey = new Map();
  const completedKeys      = new Set(); // "subject::paceNo" actually finished
  const failedKeys         = new Set(); // all 3 official attempts used, none passed
  const spByKey            = new Map(); // "subject::paceNo" → { assigned_date, end_date, completion_date, status }
  (studentPaces ?? []).forEach((p) => {
    const subject = p.pace_module?.subject;
    const moduleNumber = p.pace_module?.module_number;
    if (subject == null || moduleNumber == null) return;
    const key = `${subject}::${moduleNumber}`;
    subjectByModuleKey.set(p.sp_id, key);
    spByKey.set(key, {
      assigned_date:   p.assigned_date ?? null,
      end_date:        p.end_date ?? null,
      completion_date: p.completion_date ?? null,
      status:          p.status,
    });
  });
  const spIds = [...subjectByModuleKey.keys()];

  const scoreByModuleKey = new Map();
  if (spIds.length) {
    const { data: results } = await supabaseAdmin
      .from("pace_test_result")
      .select("sp_id, score, passed")
      .in("sp_id", spIds)
      .not("score", "is", null);   // skip not-yet-taken request/schedule rows
    (results ?? []).forEach((r) => {
      const key = subjectByModuleKey.get(r.sp_id);
      if (!key || r.score == null) return;
      const list = scoreByModuleKey.get(key) ?? [];
      list.push({ score: r.score, passed: r.passed });
      scoreByModuleKey.set(key, list);
    });
  }

  // Only a recorded passing official PACE test (≥90) counts as completion.
  scoreByModuleKey.forEach((attempts, key) => {
    const passed = attempts.some((attempt) => attempt.passed === true || Number(attempt.score) >= PACE_TEST_PASS_MARK);
    if (passed) completedKeys.add(key);
    else if (attempts.length >= PACE_TEST_MAX_ATTEMPTS) failedKeys.add(key);
  });

  // Overlay real completions (student_pace + passing tests) onto the projection
  // This is what feeds the four PACE Progress stat cards, Completion Rate included.
  //   denominator = the active-year projection slots (rows, from getPaceProjectionRows(sy_id) above)
  //   numerator   = slots counted completed, which is the projection's own status_r0/r1/r2 PLUS any
  //                 slot whose "subject::paceNo" is in completedKeys (student_pace.status =
  //                 'Completed', or a pace_test_result score >= 90 - see effectiveSlotStatus ~line 105)
  // Known gaps (left as-is for now, flagged for the panel):
  //   - the plan rows are school-year scoped but the student_pace query (~line 892) is not, so a
  //     returning student's older PACE with the same subject + module_number can mark this year's
  //     slot complete. Matching is by subject + pace number, not by sp_id.
  //   - a PACE the supervisor never planned (assigned outside the projection) does not raise the
  //     rate at all - it is not in the denominator, so only planned slots ever count.
  // The "100% Last Completion" badge on the card is hardcoded in the JSX, not computed here.
  const { completed, ongoing, remaining, completionRate } = summarizePaceSlots(rows, completedKeys);

  const teacherNames = await getTeacherNamesByIds(rows.map((r) => r.recorded_by));

  const STATUS_LABELS = {
    completed:    "Completed",
    ongoing:      "In Progress",
    "taken-home": "Taken Home",
    "needs-next": "Needs Next PACE",
    "not-started": "Not Started",
    failed:       "Failed",
  };

  // Flatten each quarterly row into its 3 individually-tracked PACE slots,
  // grouped by subject (rows already ordered by quarter ascending).
  const slotsBySubject = new Map();
  rows.forEach((r) => {
    const slots = [r.status_r0, r.status_r1, r.status_r2];
    const list  = slotsBySubject.get(r.subject) ?? [];
    slots.forEach((status, i) => {
      const paceNo = r.pace_start != null ? r.pace_start + i : null;
      const key = `${r.subject}::${paceNo}`;
      list.push({
        subject:    r.subject,
        quarter:    r.quarter,
        paceNo,
        status:     failedKeys.has(key)
          ? "failed"
          : effectiveSlotStatus(r.subject, paceNo, status, completedKeys),
        assignedBy: teacherNames.get(r.recorded_by) ?? "—",
      });
    });
    slotsBySubject.set(r.subject, list);
  });

  const currentPaces   = [];
  const completedPaces = [];
  // Every individual PACE slot, so the page can filter by quarter and offer a
  // per-subject PACE-number dropdown (isCurrent marks the active one).
  const paceModules    = [];

  // Per-slot progress: a finished PACE is 100%, untouched is 0%, anything in
  // between (in progress / taken home / needs next) shows as 50%.
  const slotProgress = (statusKey) =>
    statusKey === "completed" ? 100 : statusKey === "not-started" ? 0 : 50;
  const todayStr = new Date().toISOString().split("T")[0];

  slotsBySubject.forEach((slots) => {
    let nextPending = null;
    let queuedSlot  = null;

    slots.forEach((slot) => {
      if (slot.status === "completed") {
        const attempts = scoreByModuleKey.get(`${slot.subject}::${slot.paceNo}`) ?? [];
        const finalScore = attempts.length
          ? Math.round(attempts.reduce((sum, attempt) => sum + Number(attempt.score), 0) / attempts.length)
          : 0;
        const sp = spByKey.get(`${slot.subject}::${slot.paceNo}`) ?? {};
        completedPaces.push({
          subject:      slot.subject,
          module:       `PACE ${slot.paceNo}`,
          paceNo:       slot.paceNo ?? "—",
          assignedBy:   slot.assignedBy,
          quarter:      slot.quarter ?? null,
          assignedDate: sp.assigned_date ?? null,
          completeDate: sp.completion_date ?? null,
          finalScore,
          passed:       finalScore >= 90,
          remarks:      paceRemark(finalScore),
        });
      } else if (slot.status !== "not-started") {
        nextPending = nextPending ?? slot;
      } else {
        queuedSlot = queuedSlot ?? slot;
      }
    });

    const displaySlot = nextPending ?? queuedSlot;
    if (displaySlot) {
      currentPaces.push({
        subject:    displaySlot.subject,
        module:     `PACE ${displaySlot.paceNo}`,
        paceNo:     displaySlot.paceNo ?? "—",
        assignedBy: displaySlot.assignedBy,
        status:     STATUS_LABELS[displaySlot.status] ?? "Not Started",
        progress:   nextPending ? slotProgress(displaySlot.status) : 0,
        quarter:    displaySlot.quarter ?? null,
        startDate:  `Quarter ${displaySlot.quarter}`,
      });
    }

    // Emit ALL slots for the quarter filter + per-row PACE dropdown
    slots.forEach((slot) => {
      const sp = spByKey.get(`${slot.subject}::${slot.paceNo}`) ?? {};
      const overdue = sp.end_date && slot.status !== "completed" && todayStr > String(sp.end_date);

      // Default status label comes from the slot's progress state.
      let statusLabel = STATUS_LABELS[slot.status] ?? "Not Started";
      let remarks;

      if (slot.status === "failed") {
        statusLabel = "Failed";
        remarks = "Retake next school year";
      } else if (slot.status === "completed") {
        // A finished PACE only counts as truly done if it PASSED (score >= 90). If it
        // failed, show "Failed" here too, so this table agrees with the Completed PACEs
        // table (which grades on pass/fail) instead of contradicting it.
        const attempts = scoreByModuleKey.get(`${slot.subject}::${slot.paceNo}`) ?? [];
        const finalScore = attempts.length
          ? Math.round(attempts.reduce((sum, attempt) => sum + Number(attempt.score), 0) / attempts.length)
          : 0;
        const passed = finalScore >= 90;
        statusLabel = passed ? "Completed" : "Failed";
        remarks     = passed ? "Completed" : "Needs improvement";
      } else {
        remarks = overdue ? "Needs improvement"
          : slot.status === "not-started" ? "—"
          : "On track";
      }

      paceModules.push({
        subject:       slot.subject,
        paceNo:        slot.paceNo,
        quarter:       slot.quarter ?? null,
        assignedBy:    slot.assignedBy,
        status:        statusLabel,
        progress:      slotProgress(slot.status),
        startDate:     `Quarter ${slot.quarter}`,
        assignedDate:  sp.assigned_date ?? null,
        estimatedDate: sp.end_date ?? null,
        remarks,
        isCurrent:     displaySlot != null
          && slot.paceNo === displaySlot.paceNo
          && slot.quarter === displaySlot.quarter,
      });
    });
  });

  // ── PACE Test Request flow ──────────────────────────────────────────────
  // Source of truth is pace_test_result itself (assessment_status / _timestamp /
  // venue), which replaces the never-created pace_test_schedule table.
  const { data: spRows } = await supabaseAdmin
    .from("student_pace")
    .select("sp_id, status, pace_module(subject, module_number)")
    .eq("student_id", student_id);

  const spMeta = new Map(); // sp_id → { subject, paceNo, status }
  (spRows ?? []).forEach((p) => {
    spMeta.set(p.sp_id, {
      subject: p.pace_module?.subject ?? "—",
      paceNo:  p.pace_module?.module_number ?? null,
      status:  p.status,
    });
  });
  const allSpIds = [...spMeta.keys()];

  // Self-test eligibility per PACE: ANY attempt ≥ 80 (not the average)
  const selfReadyBySp = new Map();
  const selfTestsBySp = new Map(); // sp_id → attempts[] (for the Go to Self-Test modal)
  if (allSpIds.length) {
    const { data: selfRows } = await supabaseAdmin
      .from("self_test_result")
      .select("sp_id, score, date_taken, passed, quarter")
      .in("sp_id", allSpIds);
    (selfRows ?? []).forEach((r) => {
      if (r.score == null) return;
      if (r.score >= SELF_TEST_PASS_MARK) selfReadyBySp.set(r.sp_id, true); // READY once one attempt passes
      const list = selfTestsBySp.get(r.sp_id) ?? [];
      list.push({
        score:  r.score,
        passed: r.score >= SELF_TEST_PASS_MARK,
        date:   r.date_taken
          ? new Date(r.date_taken).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })
          : null,
        _ts:    r.date_taken ?? "",
        quarter: r.quarter ?? null,
      });
      selfTestsBySp.set(r.sp_id, list);
    });
    // Order each PACE's attempts oldest-first so they list as Self-Test 1, 2, 3…
    selfTestsBySp.forEach((list) => {
      list.sort((a, b) => String(a._ts).localeCompare(String(b._ts)));
      list.forEach((s) => delete s._ts);
    });
  }

  // PACE test rows incl. the request/schedule lifecycle columns
  const ptRowsBySp = new Map(); // sp_id → rows[]
  const pastRequests = [];
  let allPtRows = [];
  if (allSpIds.length) {
    const { data: ptRows } = await supabaseAdmin
      .from("pace_test_result")
      .select("sp_id, score, date_taken, passed, assessment_status, assessment_timestamp, venue, recorded_by")
      .in("sp_id", allSpIds);
    allPtRows = ptRows ?? [];
    (ptRows ?? []).forEach((r) => {
      const list = ptRowsBySp.get(r.sp_id) ?? [];
      list.push(r);
      ptRowsBySp.set(r.sp_id, list);
      // Past = a row that has actually been taken (scored)
      if (r.score != null) {
        const m = spMeta.get(r.sp_id);
        pastRequests.push({
          subject: m?.subject ?? "—",
          paceNo:  m?.paceNo ?? "—",
          date:    r.date_taken,
          passed:  r.passed ?? r.score >= 90,
          _ts:     r.date_taken ?? "",
        });
      }
    });
  }
  pastRequests.sort((a, b) => String(b._ts).localeCompare(String(a._ts)));
  pastRequests.forEach((p) => delete p._ts);

  const sched = (s) => String(s ?? "").toLowerCase();

  // Pick the CURRENT (testable) PACE per subject: any not-yet-Completed PACE,
  // preferring an In Progress one, else the lowest-numbered Assigned one. A
  // student can request a PACE test for it once any self-test attempt reaches 80.
  const STATUS_RANK = { "in progress": 0, assigned: 1 };
  const currentBySubject = new Map();
  (spRows ?? []).forEach((p) => {
    const status = sched(p.status);
    if (status === "completed") return;
    const m = spMeta.get(p.sp_id);
    if (!m || m.subject === "—") return;
    const cand = { sp_id: p.sp_id, subject: m.subject, paceNo: m.paceNo, rank: STATUS_RANK[status] ?? 2 };
    const prev = currentBySubject.get(m.subject);
    if (
      !prev ||
      cand.rank < prev.rank ||
      (cand.rank === prev.rank && (cand.paceNo ?? Infinity) < (prev.paceNo ?? Infinity))
    ) {
      currentBySubject.set(m.subject, cand);
    }
  });

  const testRequests = [];
  let requestStatus = null;
  currentBySubject.forEach((cand) => {
    const rows = ptRowsBySp.get(cand.sp_id) ?? [];
    const scoredAttempts = rows.filter((row) => row.score != null);
    const pacePassed = scoredAttempts.some(
      (row) => row.passed === true || Number(row.score) >= PACE_TEST_PASS_MARK,
    );
    const terminalFailed = !pacePassed && scoredAttempts.length >= PACE_TEST_MAX_ATTEMPTS;
    const scheduled = rows.find((r) => sched(r.assessment_status) === "scheduled");
    const requested = rows.find(
      (r) => ["requested", "pending"].includes(sched(r.assessment_status)) && r.score == null,
    );
    let scheduledDate = null, scheduledTime = null;
    if (scheduled?.assessment_timestamp) {
      const sdt = new Date(scheduled.assessment_timestamp);
      scheduledDate = sdt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: SCHOOL_TZ });
      scheduledTime = sdt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: SCHOOL_TZ });
    }
    // Date the student submitted the request (stamped into date_taken on submit).
    const requestedDate = requested?.date_taken
      ? new Date(requested.date_taken).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })
      : null;
    testRequests.push({
      sp_id:    cand.sp_id,
      subject:  cand.subject,
      paceNo:   cand.paceNo ?? "—",
      state:    scheduled ? "scheduled" : requested ? "requested" : "none",
      eligible: !terminalFailed && (selfReadyBySp.get(cand.sp_id) ?? false),
      failed: terminalFailed,
      attemptsUsed: scoredAttempts.length,
      selfTests: selfTestsBySp.get(cand.sp_id) ?? [], // attempts for the Go to Self-Test modal
      scheduledDate,
      scheduledTime,
      // Schedule detail (populated only when scheduled) for the View Schedule modal.
      location:      scheduled?.venue ?? "—",
      testType:      "PACE Test",
      supervisorId:  scheduled?.recorded_by ?? null,
      supervisor:    "—",
      requestedDate,
    });
    if (scheduled && !requestStatus) {
      const dt = scheduled.assessment_timestamp ? new Date(scheduled.assessment_timestamp) : null;
      // The schedule is a real instant anchored to the school offset, so format
      // in the school timezone to show the supervisor's entered wall-clock time.
      requestStatus = {
        subject:      cand.subject,
        paceNo:       cand.paceNo ?? "—",
        status:       "Scheduled",
        scheduleDate: dt ? dt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: SCHOOL_TZ }) : "—",
        time:         dt ? dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: SCHOOL_TZ }) : "—",
        venue:        scheduled.venue ?? "—",
      };
    }
  });
  testRequests.sort((a, b) => a.subject.localeCompare(b.subject));

  // Resolve supervisor names for scheduled rows in one batch (for View Schedule modal).
  const supNames = await getTeacherNamesByIds(testRequests.map((r) => r.supervisorId));
  testRequests.forEach((r) => {
    if (r.supervisorId != null) r.supervisor = supNames.get(r.supervisorId) ?? "—";
    delete r.supervisorId;
  });

  // ── Next PACE Test card: the soonest scheduled assessment ──────────────────
  let nextPaceTest = null;
  const scheduledRows = allPtRows
    .filter((r) => sched(r.assessment_status) === "scheduled" && r.assessment_timestamp)
    .sort((a, b) => String(a.assessment_timestamp).localeCompare(String(b.assessment_timestamp)));
  if (scheduledRows.length) {
    const r  = scheduledRows[0];
    const m  = spMeta.get(r.sp_id);
    const dt = new Date(r.assessment_timestamp);
    const supervisorName =
      (await getTeacherNamesByIds([r.recorded_by])).get(r.recorded_by) ?? "—";
    nextPaceTest = {
      subject:   m?.subject ?? "—",
      paceNo:    m?.paceNo ?? null,
      date:      dt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: SCHOOL_TZ }),
      time:      dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: SCHOOL_TZ }),
      status:    "Scheduled",
      location:  r.venue ?? "—",
      testType:  "PACE Test",
      supervisor: supervisorName,
      selfTests: selfTestsBySp.get(r.sp_id) ?? [], // attempts for the Go to Self-Test modal
    };
  }

  return {
    student,
    paceStats: { completed, ongoing, remaining, completionRate },
    currentPaces,
    paceModules,
    completedPaces,
    testRequests,
    pastRequests,
    requestStatus,
    nextPaceTest,
  };
};

// Student submits a request to take the PACE test for a given student_pace.
// Creates a pace_test_result row with assessment_status = 'Requested' (no score
// or schedule yet); the supervisor later sets assessment_timestamp + venue.
export const submitPaceTestRequest = async (user_id, sp_id) => {
  const { data: student, error: sErr } = await supabaseAdmin
    .from("student")
    .select("student_id, gl_id, first_name, last_name")
    .eq("user_id", user_id)
    .single();
  if (sErr) throw new Error(sErr.message);

  const spId = Number(sp_id);
  if (!spId) throw new Error("A PACE is required.");

  // Ownership: the PACE must belong to this student
  const { data: sp } = await supabaseAdmin
    .from("student_pace")
    .select("sp_id, student_id, teacher_id, pace_module(subject, module_number)")
    .eq("sp_id", spId)
    .maybeSingle();
  if (!sp || sp.student_id !== student.student_id) {
    throw new Error("That PACE was not found for your account.");
  }

  // Quarter the PACE belongs to (from the projection plan) so the supervisor's
  // quarter-filtered scheduling list shows the request.
  let quarter = null;
  const subj    = sp.pace_module?.subject;
  const paceNum = sp.pace_module?.module_number;
  if (subj != null && paceNum != null) {
    const sy_id = await getActiveSchoolYearId();
    if (sy_id) {
      const { data: projs } = await supabaseAdmin
        .from("pace_quarterly_projection")
        .select("quarter, pace_start, pace_end, pace_count")
        .eq("student_id", student.student_id)
        .eq("sy_id", sy_id)
        .eq("subject", subj);
      const match = (projs ?? []).find((p) => {
        if (p.pace_start == null) return false;
        const end = p.pace_end ?? p.pace_start + (p.pace_count ?? 1) - 1;
        return paceNum >= p.pace_start && paceNum <= end;
      });
      quarter = match?.quarter ?? null;
    }
  }

  // recorded_by is NOT NULL — the request belongs to the student's supervisor
  // (who will schedule + score it). Prefer the PACE's teacher, else the grade
  // level's teacher.
  let recorded_by = sp.teacher_id ?? null;
  if (recorded_by == null && student.gl_id) {
    const { data: gl } = await supabaseAdmin
      .from("grade_level")
      .select("teacher_id")
      .eq("gl_id", student.gl_id)
      .maybeSingle();
    recorded_by = gl?.teacher_id ?? null;
  }
  if (recorded_by == null) {
    throw new Error("No supervisor is assigned to your grade level yet. Please contact your supervisor.");
  }

  // A passed or terminally failed PACE cannot enter the request lifecycle again.
  // Count only scored rows; pending/scheduled rows do not consume attempts.
  const { data: existing } = await supabaseAdmin
    .from("pace_test_result")
    .select("pacetest_id, attempt_no, assessment_status, score, passed")
    .eq("sp_id", spId);
  const scoredAttempts = (existing ?? []).filter((row) => row.score != null);
  const pacePassed = scoredAttempts.some(
    (row) => row.passed === true || Number(row.score) >= PACE_TEST_PASS_MARK,
  );
  if (pacePassed) {
    throw new Error("This PACE Test has already been passed and cannot be requested again.");
  }
  if (scoredAttempts.length >= PACE_TEST_MAX_ATTEMPTS) {
    throw new Error("This PACE Test was failed after 3 attempts. You must wait until the next school year to retake it.");
  }

  // Eligibility: at least one self-test attempt must reach 80 (not the average)
  const { data: selfRows } = await supabaseAdmin
    .from("self_test_result")
    .select("score")
    .eq("sp_id", spId);
  const passedSelf = (selfRows ?? []).some((r) => r.score != null && r.score >= SELF_TEST_PASS_MARK);
  if (!passedSelf) {
    throw new Error("You must score at least 80% on a self-test before requesting a PACE test.");
  }

  // Reject if an active request/schedule already exists for this PACE
  const active = (existing ?? []).find(
    (r) => ["requested", "pending", "scheduled"].includes(String(r.assessment_status ?? "").toLowerCase()) && r.score == null,
  );
  if (active) throw new Error("You already have a pending or scheduled request for this PACE.");

  const attempt_no = scoredAttempts.length + 1;
  // date_taken is NOT NULL on the table; a request has no test date yet, so we
  // stamp the request date. It's never shown as a "past test" (those require a
  // non-null score), so this stays an internal placeholder until the test runs.
  const today = new Date().toISOString().split("T")[0];
  const { error: insErr } = await supabaseAdmin
    .from("pace_test_result")
    .insert({ sp_id: spId, attempt_no, assessment_status: "Requested", passed: false, date_taken: today, recorded_by, quarter });
  if (insErr) throw new Error(insErr.message);

  // Notify the supervisor that a new request is waiting to be scheduled.
  // Non-fatal: the request itself already succeeded.
  try {
    const { data: sup } = await supabaseAdmin
      .from("teacher")
      .select("user_id")
      .eq("teacher_id", recorded_by)
      .maybeSingle();
    if (sup?.user_id) {
      const studentName = `${student.first_name ?? ""} ${student.last_name ?? ""}`.trim() || "A student";
      const subjLabel   = subj != null ? `${subj} PACE ${paceNum ?? ""}`.trim() : "a PACE";
      await NotificationService.createForUsers([sup.user_id], {
        title: "New PACE Test Request",
        message_content: `${studentName} requested a PACE test for ${subjLabel}. Schedule it from PACE Test Scheduling.`,
      });
    }
  } catch (e) {
    console.warn("[pace-request] supervisor notification failed:", e.message);
  }

  return { requested: true };
};

// ─── Polls public.users until the handle_new_user trigger creates the row ─────
const waitForUserProfile = async (authId) => {
  for (let attempt = 0; attempt < 10; attempt++) {
    const { data } = await supabaseAdmin
      .from("users")
      .select("user_id")
      .eq("auth_id", authId)
      .maybeSingle();
    if (data?.user_id) return data;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("User profile was not created in time by the trigger. Please retry.");
};

// CSV import. Two modes, driven by `overwrite`:
//   overwrite = false (default) — create the genuinely new students, and for anyone
//     already in the system, DON'T touch them: collect them into `duplicates` so the
//     caller can prompt the principal ("this student already exists — overwrite?").
//   overwrite = true — update those existing students' profiles in place (keeping their
//     student_id / login / academic history) and create any that are still new.
// Existing students are matched on first name + last name + date of birth, so the trap
// works no matter how the student was originally added (CSV or the single-add form).
export const importStudents = async (rows, { overwrite = false } = {}) => {
  const succeeded   = [];   // newly created students
  const overwritten = [];   // existing students updated in place (overwrite mode)
  const duplicates  = [];   // existing students left untouched, awaiting a decision
  const failed      = [];

  // Get active school year for grade level lookup
  const { data: activeSY } = await supabaseAdmin
    .from("school_year")
    .select("sy_id")
    .eq("is_active", true)
    .maybeSingle();

  // Build a grade level name → gl_id map for the active SY
  const gradeLevelMap = {};
  if (activeSY) {
    const { data: levels } = await supabaseAdmin
      .from("grade_level")
      .select("gl_id, level_name")
      .eq("sy_id", activeSY.sy_id);
    (levels ?? []).forEach((l) => {
      gradeLevelMap[l.level_name.toLowerCase().trim()] = l.gl_id;
    });
  }

  // Pre-load existing students so we can flag re-imports of the same person.
  // Key: "firstname|lastname|dobDigits" (case-insensitive, dashes stripped from the DOB
  // so "2012-03-14" and "20120314" collide the same way).
  const dupKey = (fn, ln, dob) =>
    `${String(fn ?? "").toLowerCase().trim()}|${String(ln ?? "").toLowerCase().trim()}|${String(dob ?? "").replace(/\D/g, "")}`;
  const { data: allStudents } = await supabaseAdmin
    .from("student")
    .select("student_id, user_id, first_name, last_name, date_of_birth");
  const existingByKey = new Map(
    (allStudents ?? []).map((s) => [dupKey(s.first_name, s.last_name, s.date_of_birth), s])
  );

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const { first_name, last_name, date_of_birth, gender, address, contact_number, enrollment_date, grade_level } = row;
    const fullName = `${first_name} ${last_name}`.trim();

    try {
      // Resolve grade level
      const gl_id = gradeLevelMap[grade_level?.toLowerCase().trim()] ?? null;
      if (grade_level && !gl_id) {
        throw new Error(`Grade level "${grade_level}" not found in the active school year.`);
      }

      const existing = existingByKey.get(dupKey(first_name, last_name, date_of_birth));

      // ── Already in the system ──
      if (existing) {
        if (!overwrite) {
          // Leave them untouched and report back so the principal can decide.
          duplicates.push({ index, name: fullName });
          continue;
        }
        // Overwrite confirmed — refresh the existing student's profile in place.
        // student_id / login stay the same; academic history is untouched.
        const { error: updErr } = await supabaseAdmin
          .from("student")
          .update({
            first_name,
            last_name,
            date_of_birth,
            gender,
            address,
            contact_number,
            enrollment_date,
            ...(gl_id ? { gl_id } : {}),
          })
          .eq("student_id", existing.student_id);
        if (updErr) throw new Error(updErr.message);
        overwritten.push(fullName);
        continue;
      }

      // ── New student — create Auth account + profile + student row ──
      const password = date_of_birth.replace(/\D/g, "");
      const base     = `${first_name}.${last_name}`.toLowerCase().replace(/\s+/g, ".");
      const username = base;
      const email    = `${base}.${password}@lca.edu`;

      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { username, role: "student" },
      });

      if (authError) {
        // Safety net: the pre-check missed it (e.g. an account created moments ago).
        // Treat a duplicate email as an existing student, not a hard failure.
        if (authError.message.toLowerCase().includes("already been registered")) {
          duplicates.push({ index, name: fullName });
          continue;
        }
        throw new Error(describeAuthCreateError(authError));
      }

      let userProfile;
      try {
        userProfile = await waitForUserProfile(authData.user.id);
      } catch (triggerErr) {
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
        throw triggerErr;
      }

      // Assign the school-format ID (YYNN): YY = enrollment year, NN = increment.
      const newStudentId = await generateNextStudentId(enrollment_date);

      const { error: studentError } = await supabaseAdmin.from("student").insert({
        student_id: newStudentId,
        user_id: userProfile.user_id,
        first_name,
        last_name,
        date_of_birth,
        gender,
        address,
        contact_number,
        enrollment_date,
        ...(gl_id ? { gl_id } : {}),
      });

      if (studentError) {
        await supabaseAdmin.from("users").delete().eq("user_id", userProfile.user_id);
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
        throw new Error(studentError.message);
      }

      // Register it so a later row in the same file repeating this person is caught too.
      existingByKey.set(dupKey(first_name, last_name, date_of_birth), {
        student_id: newStudentId,
        user_id: userProfile.user_id,
      });
      succeeded.push(fullName);
    } catch (err) {
      failed.push({ name: fullName, reason: err.message });
    }
  }

  return { imported: succeeded.length, overwritten: overwritten.length, duplicates, failed };
};

export const getStudentDashboard = async (user_id) => {
  // Get student profile
  const { data: student, error: studentErr } = await supabaseAdmin
    .from("student")
    .select("student_id, first_name, last_name")
    .eq("user_id", user_id)
    .single();
  if (studentErr) throw new Error(studentErr.message);

  const student_id = student.student_id;
  const sy_id = await getActiveSchoolYearId();
  const rows  = await getPaceProjectionRows(student_id, sy_id);

  // PACE stats — counted from pace_quarterly_projection status slots
  const { completed, ongoing, remaining } = summarizePaceSlots(rows);

  // Scores for current PACE / overall — from pace_test_result + check_up_result via student_pace
  const { data: studentPaces } = await supabaseAdmin
    .from("student_pace")
    .select("sp_id, pace_module(subject)")
    .eq("student_id", student_id);

  const subjectBySp = new Map();
  (studentPaces ?? []).forEach((p) => subjectBySp.set(p.sp_id, p.pace_module?.subject));
  const spIds = [...subjectBySp.keys()];

  let allPaceTests = [];
  let allCheckups  = [];
  if (spIds.length) {
    const [{ data: pt }, { data: cu }] = await Promise.all([
      supabaseAdmin.from("pace_test_result").select("sp_id, score").in("sp_id", spIds),
      supabaseAdmin.from("check_up_result").select("sp_id, score").in("sp_id", spIds),
    ]);
    allPaceTests = pt ?? [];
    allCheckups  = cu ?? [];
  }

  // Current PACE — first subject/quarter row that is still in progress
  const currentRow = rows.find((r) => deriveSubjectStatus(r) === "ongoing");
  let currentPace = null;

  if (currentRow) {
    const slots     = [currentRow.status_r0, currentRow.status_r1, currentRow.status_r2];
    const doneCount = slots.filter((s) => s === "completed").length;

    const subjectCheckups = allCheckups.filter((c) => subjectBySp.get(c.sp_id) === currentRow.subject);
    const latestCheckup = subjectCheckups.length
      ? Math.round(subjectCheckups.reduce((s, c) => s + c.score, 0) / subjectCheckups.length)
      : 0;

    currentPace = {
      subject:       currentRow.subject,
      module:        paceRange(currentRow),
      status:        "In Progress",
      progress:      Math.round((doneCount / 3) * 100),
      latestCheckup,
    };
  }

  // Overall score — average of all pace test results for this student
  // Source: pace_test_result.score, joined to the student through student_pace.sp_id (spIds above).
  // Straight unweighted mean of every row, rounded to 1 decimal; 0 when the student has no tests yet.
  // Known gaps (left as-is for now, flagged for the panel):
  //   - not school-year scoped. The student_pace query (~line 1567) filters on student_id only, no
  //     sy_id, so a returning student's average still includes last year's PACE tests. paceStats and
  //     paceChart above DO use the active sy_id, so this card can disagree with the rest of the page.
  //   - every row counts equally, retakes and failed attempts included - there is no "latest attempt
  //     only" or pass-only (>= 90) filter here.
  //   - check_up_result does NOT feed this number; it only fed currentPace.latestCheckup.
  // The "+2.4% From Last Assessment" badge on the card is hardcoded in the JSX, not computed here.
  const overallScore = allPaceTests.length
    ? Math.round((allPaceTests.reduce((s, t) => s + t.score, 0) / allPaceTests.length) * 10) / 10
    : 0;

  // Pace chart — completed PACE slots per quarter
  const paceChart = rows.length
    ? [1, 2, 3, 4].map((q) => {
        let count = 0;
        rows
          .filter((r) => r.quarter === q)
          .forEach((r) => {
            [r.status_r0, r.status_r1, r.status_r2].forEach((s) => { if (s === "completed") count++; });
          });
        return { month: `Q${q}`, count };
      })
    : null;

  // Announcements for student
  const { data: announcements } = await supabaseAdmin
    .from("announcement")
    .select("ann_id, title, posted_date, audience_role")
    .in("audience_role", ["All", "Student"])
    .eq("is_active", true)
    .order("posted_date", { ascending: false })
    .limit(4);

  return {
    student,
    paceStats:     { completed, ongoing, remaining },
    overallScore,
    currentPace,
    paceChart,
    announcements: (announcements ?? []).map((a) => ({
      id:    a.ann_id,
      title: a.title,
      meta:  `${new Date(a.posted_date).toLocaleDateString("en-PH")} • ${a.audience_role}`,
    })),
  };
};

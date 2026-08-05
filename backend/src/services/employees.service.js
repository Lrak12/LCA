import { supabaseAdmin } from "../config/supabase.js";

export const getEmployees = async () => {
  const [{ data: teachers }, { data: admins }] = await Promise.all([
    supabaseAdmin
      .from("teacher")
      .select("teacher_id, first_name, last_name, contact_number, user_id, users(email, is_active)"),
    supabaseAdmin
      .from("principal")
      .select("principal_id, first_name, last_name, contact_number, user_id, users(email, is_active)"),
  ]);

  const teacherList = (teachers ?? []).map((t) => ({
    id:             t.teacher_id,
    school_id:      t.teacher_id,
    first_name:     t.first_name,
    last_name:      t.last_name,
    contact_number: t.contact_number,
    email:          t.users?.email,
    is_active:      t.users?.is_active,
    role:           "teacher",
  }));

  const adminList = (admins ?? []).map((a) => ({
    id:             a.principal_id,
    school_id:      a.principal_id,
    first_name:     a.first_name,
    last_name:      a.last_name,
    contact_number: a.contact_number,
    email:          a.users?.email,
    is_active:      a.users?.is_active,
    role:           "principal",
  }));

  return [...teacherList, ...adminList];
};

// ── Supervisors (teaching staff) ──────────────────────────────────────────────
// A "supervisor" is a teacher. Each row carries the grade levels they're assigned
// (grade_level.teacher_id) and the distinct PACE subjects supervised, derived from
// the PACEs taken by students in those grade levels.
export const getSupervisors = async () => {
  // Scope grade-level assignments to the active school year so the list matches
  // the grade-level picker (getAllGradeLevels also filters by the active sy_id).
  // Without this, supervisors could show/prefill grade levels from other school
  // years that aren't offered as options — the edit modal can't uncheck them, so
  // updates re-submit the stale ids and the assignment appears not to change.
  const { data: activeSy } = await supabaseAdmin
    .from("school_year")
    .select("sy_id")
    .eq("is_active", true)
    .single();

  const [
    { data: teachers },
    { data: gradeLevels },
    { data: students },
    { data: studentPaces },
  ] = await Promise.all([
    supabaseAdmin
      .from("teacher")
      .select("teacher_id, first_name, last_name, contact_number, user_id, users(email, is_active)")
      .order("last_name"),
    supabaseAdmin
      .from("grade_level")
      .select("gl_id, level_name, teacher_id")
      .eq("sy_id", activeSy?.sy_id ?? -1),
    supabaseAdmin.from("student").select("student_id, gl_id"),
    supabaseAdmin.from("student_pace").select("student_id, pace_module(subject)"),
  ]);

  // student headcount per grade level
  const studentCountByGl = new Map();
  (students ?? []).forEach((s) => {
    studentCountByGl.set(s.gl_id, (studentCountByGl.get(s.gl_id) ?? 0) + 1);
  });

  // gl_id → teacher_id, and teacher_id → [{ gl_id, name, studentCount }]
  const glToTeacher     = new Map();
  const levelsByTeacher = new Map();
  (gradeLevels ?? []).forEach((gl) => {
    if (gl.teacher_id == null) return;
    glToTeacher.set(gl.gl_id, gl.teacher_id);
    const list = levelsByTeacher.get(gl.teacher_id) ?? [];
    list.push({
      gl_id:        gl.gl_id,
      name:         gl.level_name,
      studentCount: studentCountByGl.get(gl.gl_id) ?? 0,
    });
    levelsByTeacher.set(gl.teacher_id, list);
  });

  // student_id → teacher_id (via grade level)
  const studentToTeacher = new Map();
  (students ?? []).forEach((s) => {
    const tid = glToTeacher.get(s.gl_id);
    if (tid != null) studentToTeacher.set(s.student_id, tid);
  });

  // teacher_id → Set(subject)
  const subjectsByTeacher = new Map();
  (studentPaces ?? []).forEach((sp) => {
    const tid     = studentToTeacher.get(sp.student_id);
    const subject = sp.pace_module?.subject;
    if (tid == null || !subject) return;
    if (!subjectsByTeacher.has(tid)) subjectsByTeacher.set(tid, new Set());
    subjectsByTeacher.get(tid).add(subject);
  });

  return (teachers ?? []).map((t) => {
    const details = levelsByTeacher.get(t.teacher_id) ?? [];
    return {
      id:                t.teacher_id,
      teacher_id:        t.teacher_id,
      first_name:        t.first_name,
      last_name:         t.last_name,
      contact_number:    t.contact_number,
      email:             t.users?.email,
      is_active:         t.users?.is_active ?? false,
      gradeLevels:       details.map((d) => d.name),
      gradeLevelDetails: details,
      totalStudents:     details.reduce((sum, d) => sum + d.studentCount, 0),
      paceModules:       [...(subjectsByTeacher.get(t.teacher_id) ?? [])],
    };
  });
};

export const getSupervisorStats = async () => {
  const [
    { count: total },
    { count: active },
  ] = await Promise.all([
    supabaseAdmin.from("teacher").select("*", { count: "exact", head: true }),
    supabaseAdmin
      .from("teacher")
      .select("teacher_id, users!inner(is_active)", { count: "exact", head: true })
      .eq("users.is_active", true),
  ]);

  return {
    total:    total  ?? 0,
    active:   active ?? 0,
    inactive: (total ?? 0) - (active ?? 0),
  };
};

export const getEmployeeStats = async () => {
  const [
    { count: teachers },
    { count: admins },
    { count: active },
  ] = await Promise.all([
    supabaseAdmin.from("teacher").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("principal").select("*", { count: "exact", head: true }),
    supabaseAdmin
      .from("users")
      .select("*", { count: "exact", head: true })
      .in("role", ["teacher", "principal"])
      .eq("is_active", true),
  ]);

  return {
    teachers: teachers ?? 0,
    admins:   admins   ?? 0,
    total:    (teachers ?? 0) + (admins ?? 0),
    active:   active   ?? 0,
  };
};

export const createEmployee = async ({
  first_name,
  last_name,
  role,
  email,
  contact_number,
  username,
  password,
  is_active = true,
  grade_level_ids = [],
}) => {
  // 1. Create Supabase Auth user — trigger will auto-insert into users table
  const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      username,
      role: role === "principal" ? "principal" : "teacher",
    },
  });
  if (authErr) throw new Error(authErr.message);

  const authId = authData.user.id;

  // 2. Get the user record created by the trigger
  const { data: user, error: userErr } = await supabaseAdmin
    .from("users")
    .select("user_id")
    .eq("auth_id", authId)
    .single();
  if (userErr) {
    await supabaseAdmin.auth.admin.deleteUser(authId);
    throw new Error(userErr.message);
  }

  // 2b. Apply account status (the trigger defaults new users to active)
  if (is_active === false) {
    await supabaseAdmin.from("users").update({ is_active: false }).eq("user_id", user.user_id);
  }

  // 3. Create role-specific profile (capture the new id so we can assign grade levels)
  const profileTable = role === "principal" ? "principal" : "teacher";
  const { data: profile, error: profileErr } = await supabaseAdmin
    .from(profileTable)
    .insert({ user_id: user.user_id, first_name, last_name, contact_number })
    .select()
    .single();
  if (profileErr) {
    await supabaseAdmin.auth.admin.deleteUser(authId);
    throw new Error(profileErr.message);
  }

  // 4. Assign the supervisor to the selected grade levels
  if (role !== "principal" && profile?.teacher_id && grade_level_ids.length) {
    const { error: assignErr } = await supabaseAdmin
      .from("grade_level")
      .update({ teacher_id: profile.teacher_id })
      .in("gl_id", grade_level_ids);
    if (assignErr) throw new Error(assignErr.message);
  }

  return { user_id: user.user_id, first_name, last_name, role, email };
};

// Update an existing supervisor (teacher): profile fields, account status, email,
// and grade-level assignments. Password/username are not editable here.
export const updateSupervisor = async (teacher_id, {
  first_name,
  last_name,
  email,
  contact_number,
  is_active,
  grade_level_ids = [],
}) => {
  const id = Number(teacher_id);

  // Load the teacher + its linked user (for status/email + auth email sync)
  const { data: teacher, error: teacherErr } = await supabaseAdmin
    .from("teacher")
    .select("teacher_id, user_id, users(auth_id, email)")
    .eq("teacher_id", id)
    .single();
  if (teacherErr || !teacher) throw new Error(teacherErr?.message ?? `Supervisor ${id} not found`);

  // 1. Profile fields on the teacher row
  const { error: profileErr } = await supabaseAdmin
    .from("teacher")
    .update({
      first_name,
      last_name,
      contact_number: contact_number?.trim() || null,
    })
    .eq("teacher_id", id);
  if (profileErr) throw new Error(profileErr.message);

  // 2. Linked users row: account status + email (only when they change)
  const emailChanged = email && email !== teacher.users?.email;
  const userUpdate = {};
  if (typeof is_active === "boolean") userUpdate.is_active = is_active;
  if (emailChanged) userUpdate.email = email;
  if (Object.keys(userUpdate).length) {
    const { error: userErr } = await supabaseAdmin
      .from("users")
      .update(userUpdate)
      .eq("user_id", teacher.user_id);
    if (userErr) throw new Error(userErr.message);
  }

  // 2b. Keep Supabase Auth in sync when the email changed. email_confirm:true applies
  // the new address immediately (auto-verified, no confirmation step) — same as the
  // admin User Management flow, and avoids leaving a stale pending email change.
  if (emailChanged && teacher.users?.auth_id) {
    const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(
      teacher.users.auth_id,
      { email, email_confirm: true },
    );
    if (authErr) throw new Error(authErr.message);
  }

  // 3. Reassign grade levels: clear this teacher's current ones, then set the selected.
  //    (grade_level.teacher_id holds a single supervisor per grade level.)
  const { error: clearErr } = await supabaseAdmin
    .from("grade_level")
    .update({ teacher_id: null })
    .eq("teacher_id", id);
  if (clearErr) throw new Error(clearErr.message);

  if (grade_level_ids.length) {
    const { error: assignErr } = await supabaseAdmin
      .from("grade_level")
      .update({ teacher_id: id })
      .in("gl_id", grade_level_ids);
    if (assignErr) throw new Error(assignErr.message);
  }

  return { teacher_id: id, first_name, last_name, email, is_active };
};
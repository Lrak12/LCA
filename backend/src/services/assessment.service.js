import * as DiagnosticModel    from "../models/diagnosticAssessment.model.js";
import * as PrincipalModel from "../models/principal.model.js";
import * as SchoolYearModel    from "../models/schoolYear.model.js";
import * as CheckUpModel       from "../models/checkUpResult.model.js";
import * as SelfTestModel   from "../models/selfTestResult.model.js";
import * as PaceTestModel   from "../models/paceTestResult.model.js";
import * as StudentPaceModel from "../models/studentPace.model.js";
import * as TeacherModel    from "../models/teacher.model.js";

const PASSING_SCORE = 80;

// ─── Diagnostic Assessments ───────────────────────────────────────────────────

export const getAllDiagnostics = async () => {
  const { data, error } = await DiagnosticModel.findAll();
  if (error) throw new Error(error.message);
  return data;
};

export const getDiagnosticsByStudent = async (student_id) => {
  const { data, error } = await DiagnosticModel.findByStudent(student_id);
  if (error) throw new Error(error.message);
  return data;
};

export const createDiagnostic = async (payload, user) => {
  const { data: principal, error: principalErr } = await PrincipalModel.findByUserId(user.user_id);
  if (principalErr || !principal) throw new Error("Principal profile not found");

  // Get active school year
  const { data: sy, error: syErr } = await SchoolYearModel.findActive();
  if (syErr || !sy) throw new Error("No active school year found");

  const { data, error } = await DiagnosticModel.create({
    ...payload,
    sy_id:       sy.sy_id,
    recorded_by: principal.principal_id,
  });
  if (error) throw new Error(error.message);
  return data;
};

export const updateDiagnostic = async (diag_id, payload) => {
  const { data, error } = await DiagnosticModel.update(diag_id, payload);
  if (error) throw new Error(error.message);
  return data;
};

const resolveTeacherId = async (payload, requestingUser) => {
  if (requestingUser.role === "administrator") return payload.recorded_by;
  const { data: teacher, error } = await TeacherModel.findByUserId(requestingUser.user_id);
  if (error || !teacher) throw new Error("Teacher profile not found");
  return teacher.teacher_id;
};

export const getCheckUpsByPace = async (sp_id) => {
  const { data, error } = await CheckUpModel.findByPace(sp_id);
  if (error) throw new Error(error.message);
  return data;
};

export const recordCheckUp = async (payload, requestingUser) => {
  const recorded_by = await resolveTeacherId(payload, requestingUser);
  const passed = payload.score >= PASSING_SCORE;
  const { data, error } = await CheckUpModel.create({ ...payload, recorded_by, passed });
  if (error) throw new Error(error.message);
  return data;
};

export const updateCheckUp = async (checkup_id, payload) => {
  const { data, error } = await CheckUpModel.update(checkup_id, payload);
  if (error) throw new Error(error.message);
  return data;
};

export const getSelfTestByPace = async (sp_id) => {
  const { data, error } = await SelfTestModel.findByPace(sp_id);
  if (error) throw new Error(error.message);
  return data;
};

export const recordSelfTest = async (payload) => {
  const passed = payload.score >= PASSING_SCORE;
  const { data: existing } = await SelfTestModel.findByPace(payload.selftest_id);

  if (existing) {
    const { data, error } = await SelfTestModel.update(payload.selftest_id, { ...payload, passed });
    if (error) throw new Error(error.message);
    return data;
  }

  const { data, error } = await SelfTestModel.create({ ...payload, passed });
  if (error) throw new Error(error.message);
  return data;
};

export const getPaceTestByPace = async (sp_id) => {
  const { data, error } = await PaceTestModel.findByPace(sp_id);
  if (error) throw new Error(error.message);
  return data;
};

export const recordPaceTest = async (payload, requestingUser) => {
  const recorded_by = await resolveTeacherId(payload, requestingUser);
  const passed = payload.score >= PASSING_SCORE;

  const { data: existing } = await PaceTestModel.findByPace(payload.pacetest_id);

  if (existing) {
    const { data, error } = await PaceTestModel.update(payload.pacetest_id, { ...payload, recorded_by, passed });
    if (error) throw new Error(error.message);
    if (passed) {
      await StudentPaceModel.update(payload.pacetest_id, {
        status: "Completed",
        end_date: new Date().toISOString().split("T")[0],
      });
    }
    return data;
  }

  const { data, error } = await PaceTestModel.create({ ...payload, recorded_by, passed });
  if (error) throw new Error(error.message);
  if (passed) {
    await StudentPaceModel.update(payload.pacetest_id, {
      status: "Completed",
      end_date: new Date().toISOString().split("T")[0],
    });
  }
  return data;
};

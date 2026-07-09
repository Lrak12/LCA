import * as StudentPaceModel from "../models/studentPace.model.js";
import * as PaceModuleModel from "../models/paceModule.model.js";
import * as TeacherModel from "../models/teacher.model.js";

export const getAllStudentPaces = async () => {
  const { data, error } = await StudentPaceModel.findAll();
  if (error) throw new Error(error.message);
  return data;
};

export const getStudentPaceById = async (sp_id) => {
  const { data, error } = await StudentPaceModel.findById(sp_id);
  if (error) throw new Error("PACE record not found");
  return data;
};

export const getPacesByStudent = async (student_id) => {
  const { data, error } = await StudentPaceModel.findByStudent(student_id);
  if (error) throw new Error(error.message);

  const completed  = data.filter((p) => p.status === "Completed").length;
  const inProgress = data.filter((p) => p.status === "In Progress").length;
  const assigned   = data.filter((p) => p.status === "Assigned").length;

  return {
    paces: data,
    summary: { total: data.length, completed, inProgress, assigned },
  };
};

export const getPacesByTeacher = async (teacher_id) => {
  const { data, error } = await StudentPaceModel.findByTeacher(teacher_id);
  if (error) throw new Error(error.message);
  return data;
};

export const assignPace = async (payload, requestingUser) => {
  let teacher_id = payload.teacher_id;

  if (requestingUser.role === "teacher") {
    const { data: teacher, error } = await TeacherModel.findByUserId(requestingUser.user_id);
    if (error || !teacher) throw new Error("Teacher profile not found");
    teacher_id = teacher.teacher_id;
  }

  const { data, error } = await StudentPaceModel.create({ ...payload, teacher_id });
  if (error) throw new Error(error.message);
  return data;
};

export const updatePaceStatus = async (sp_id, payload) => {
  const { data, error } = await StudentPaceModel.update(sp_id, payload);
  if (error) throw new Error(error.message);
  return data;
};

export const deletePace = async (sp_id) => {
  const { error } = await StudentPaceModel.remove(sp_id);
  if (error) throw new Error(error.message);
};

export const getAllModules = async (gl_id) => {
  const { data, error } = await PaceModuleModel.findAll(gl_id);
  if (error) throw new Error(error.message);
  return data;
};

export const getModuleById = async (module_id) => {
  const { data, error } = await PaceModuleModel.findById(module_id);
  if (error) throw new Error("Module not found");
  return data;
};

export const createModule = async (payload) => {
  const { data, error } = await PaceModuleModel.create(payload);
  if (error) throw new Error(error.message);
  return data;
};

export const updateModule = async (module_id, payload) => {
  const { data, error } = await PaceModuleModel.update(module_id, payload);
  if (error) throw new Error(error.message);
  return data;
};

export const deleteModule = async (module_id) => {
  const { error } = await PaceModuleModel.remove(module_id);
  if (error) throw new Error(error.message);
};

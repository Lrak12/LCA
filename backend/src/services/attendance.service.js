import * as AttendanceModel from "../models/attendance.model.js";
import * as TeacherModel    from "../models/teacher.model.js";

export const getAttendance = async (filters) => {
  const { data, error } = await AttendanceModel.findAll(filters);
  if (error) throw new Error(error.message);
  return data;
};

export const recordAttendance = async (payload, requestingUser) => {
  let teacher_id = payload.teacher_id;

  if (requestingUser.role === "teacher") {
    const { data: teacher, error } = await TeacherModel.findByUserId(requestingUser.user_id);
    if (error || !teacher) throw new Error("Teacher profile not found");
    teacher_id = teacher.teacher_id;
  }

  const { data, error } = await AttendanceModel.create({ ...payload, teacher_id });
  if (error) throw new Error(error.message);
  return data;
};

export const updateAttendance = async (att_id, payload) => {
  const { data, error } = await AttendanceModel.update(att_id, payload);
  if (error) throw new Error(error.message);
  return data;
};

export const deleteAttendance = async (att_id) => {
  const { error } = await AttendanceModel.remove(att_id);
  if (error) throw new Error(error.message);
};

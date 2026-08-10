import client from "./client.js";

export const fetchAllSections       = ()                => client.get("/grade-levels");
export const enrollStudentsInLevel  = (id, student_ids) => client.post(`/grade-levels/${id}/students`, { student_ids });
export const removeStudentFromLevel = (id, student_id)  => client.delete(`/grade-levels/${id}/students/${student_id}`);
export const assignTeacherToSection = (id, teacher_id)  => client.post(`/grade-levels/${id}/teacher`, { teacher_id });
// clears the grade level's supervisor; teacher_id is optional and guards against a stale request
export const unassignTeacherFromSection = (id, teacher_id) =>
  client.delete(teacher_id ? `/grade-levels/${id}/teacher/${teacher_id}` : `/grade-levels/${id}/teacher`);

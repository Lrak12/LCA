import client from "./client.js";

export const fetchAllSections       = ()                => client.get("/grade-levels");
export const createGradeSection = (id, name) => client.post(`/grade-levels/${id}/sections`, { name });
export const assignSectionStudents = (id, sectionId, student_ids) => client.post(`/grade-levels/${id}/sections/${sectionId}/students`, { student_ids });
export const removeSectionStudent = (id, sectionId, studentId) => client.delete(`/grade-levels/${id}/sections/${sectionId}/students/${studentId}`);
export const assignSectionSupervisor = (id, sectionId, teacher_id) => client.put(`/grade-levels/${id}/sections/${sectionId}/teacher`, { teacher_id });
export const unassignSectionSupervisor = (id, sectionId) => client.delete(`/grade-levels/${id}/sections/${sectionId}/teacher`);
export const enrollStudentsInLevel  = (id, student_ids) => client.post(`/grade-levels/${id}/students`, { student_ids });
export const removeStudentFromLevel = (id, student_id)  => client.delete(`/grade-levels/${id}/students/${student_id}`);
export const assignTeacherToSection = (id, teacher_id)  => client.post(`/grade-levels/${id}/teacher`, { teacher_id });
// clears the grade level's supervisor; teacher_id is optional and guards against a stale request
export const unassignTeacherFromSection = (id, teacher_id) =>
  client.delete(teacher_id ? `/grade-levels/${id}/teacher/${teacher_id}` : `/grade-levels/${id}/teacher`);

export const collectTeacherScope = (grades, sections, students, teacher_id) => {
  const ownedGradeIds = new Set(grades.filter((grade) => Number(grade.teacher_id) === Number(teacher_id)).map((grade) => Number(grade.gl_id)));
  const ownedSectionIds = new Set(sections.map((section) => Number(section.section_id)));
  const glIds = [...new Set([...ownedGradeIds, ...sections.map((section) => Number(section.gl_id))])];
  const studentIds = students
    .filter((student) => student.section_id != null
      ? ownedSectionIds.has(Number(student.section_id))
      : ownedGradeIds.has(Number(student.gl_id)))
    .map((student) => Number(student.student_id));
  return { glIds, sectionIds: [...ownedSectionIds], studentIds };
};

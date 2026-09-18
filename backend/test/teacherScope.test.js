import test from "node:test";
import assert from "node:assert/strict";
import { collectTeacherScope } from "../src/helpers/teacherScope.js";

test("section supervisors see only students in their own sections", () => {
  const grades = [{ gl_id: 1, teacher_id: 10 }, { gl_id: 2, teacher_id: null }];
  const sectionsForTeacher20 = [{ section_id: 101, gl_id: 1, teacher_id: 20 }];
  const students = [
    { student_id: 1, gl_id: 1, section_id: null },
    { student_id: 2, gl_id: 1, section_id: 101 },
    { student_id: 3, gl_id: 1, section_id: 102 },
    { student_id: 4, gl_id: 2, section_id: null },
  ];

  assert.deepEqual(collectTeacherScope(grades, [], students, 10).studentIds, [1]);
  assert.deepEqual(collectTeacherScope(grades, sectionsForTeacher20, students, 20).studentIds, [2]);
});

test("a supervisor assigned to multiple sections sees the union without unsectioned students", () => {
  const grades = [{ gl_id: 1, teacher_id: null }];
  const sections = [{ section_id: 101, gl_id: 1 }, { section_id: 102, gl_id: 1 }];
  const students = [
    { student_id: 1, gl_id: 1, section_id: 101 },
    { student_id: 2, gl_id: 1, section_id: 102 },
    { student_id: 3, gl_id: 1, section_id: null },
  ];

  assert.deepEqual(collectTeacherScope(grades, sections, students, 20).studentIds, [1, 2]);
});

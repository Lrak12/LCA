import test from "node:test";
import assert from "node:assert/strict";
import { isSectionSchemaUnavailable } from "../src/helpers/sectionSchema.js";

test("recognizes missing section migration errors", () => {
  assert.equal(isSectionSchemaUnavailable({ code: "PGRST205", message: "Could not find the table public.grade_section" }), true);
  assert.equal(isSectionSchemaUnavailable({ code: "42703", message: "column student.section_id does not exist" }), true);
  assert.equal(isSectionSchemaUnavailable({ code: "PGRST204", message: "Could not find section_id column" }), true);
});

test("does not hide unrelated database failures", () => {
  assert.equal(isSectionSchemaUnavailable({ code: "42501", message: "permission denied for grade_section" }), false);
  assert.equal(isSectionSchemaUnavailable({ code: "42703", message: "column teacher_id does not exist" }), false);
});

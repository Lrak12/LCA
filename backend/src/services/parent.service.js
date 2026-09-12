import * as ParentModel from "../models/parent.model.js";
import { supabaseAdmin } from "../config/supabase.js";

const SUBJECT_ORDER = [
  "English",
  "Mathematics",
  "Science",
  "Word Building",
  "Filipino",
  "Sibika at Kultura/Heograpiya Kasaysayan at Sibika",
  "Literature and Creative Writing",
];

export const getParentDashboard = async (user_id) => {
  const { data: parent, error: parentError } = await ParentModel.findByUserId(user_id);
  if (parentError || !parent) throw new Error("Parent profile not found");

  const [{ data: links, error: linksError }, { data: schoolYear, error: yearError }] = await Promise.all([
    ParentModel.findLinkedStudents(parent.parent_id),
    supabaseAdmin
      .from("school_year")
      .select("sy_id, year_label")
      .eq("is_active", true)
      .maybeSingle(),
  ]);
  if (linksError) throw new Error(linksError.message);
  if (yearError) throw new Error(yearError.message);

  const linkedStudents = (links ?? []).map((link) => link.student).filter(Boolean);
  const studentIds = linkedStudents.map((student) => student.student_id);
  const { data: projections, error: projectionError } = schoolYear?.sy_id && studentIds.length
    ? await supabaseAdmin
        .from("pace_quarterly_projection")
        .select("student_id, subject, quarter, pace_start, pace_end, pace_count, status_r0, status_r1, status_r2")
        .eq("sy_id", schoolYear.sy_id)
        .in("student_id", studentIds)
        .order("quarter")
    : { data: [], error: null };
  if (projectionError) throw new Error(projectionError.message);

  const subjectRank = (subject) => {
    const index = SUBJECT_ORDER.indexOf(subject);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };

  return {
    parent: {
      parent_id: parent.parent_id,
      name: `${parent.first_name ?? ""} ${parent.last_name ?? ""}`.trim(),
    },
    schoolYear: schoolYear?.year_label ?? null,
    students: linkedStudents.map((student) => ({
      student_id: student.student_id,
      name: `${student.first_name ?? ""} ${student.last_name ?? ""}`.trim(),
      projections: (projections ?? [])
        .filter((row) => row.student_id === student.student_id)
        .sort((a, b) => subjectRank(a.subject) - subjectRank(b.subject) || a.quarter - b.quarter),
    })),
  };
};

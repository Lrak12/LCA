import { supabaseAdmin } from "../config/supabase.js";
import { updateSchoolYear as updateSchoolYearRecord } from "./schoolYear.service.js";

export const getSettingsOverview = async () => {
  const { data: schoolYear, error: syErr } = await supabaseAdmin
    .from("school_year")
    .select("*")
    .eq("is_active", true)
    .single();
  if (syErr) throw new Error(syErr.message);
  return { schoolYear };
};

export const getAcademicConfig = async () => {
  const { data: schoolYear, error: syErr } = await supabaseAdmin
    .from("school_year")
    .select("*")
    .eq("is_active", true)
    .single();
  if (syErr) throw new Error(syErr.message);

  const { data: gradeLevels, error: glErr } = await supabaseAdmin
    .from("grade_level")
    .select("gl_id, level_name, level_order")
    .eq("sy_id", schoolYear.sy_id)
    .order("level_order");
  if (glErr) throw new Error(glErr.message);

  const quarters = buildQuarters(schoolYear);

  return { schoolYear, quarters, gradeLevels };
};

// A school year supports at most Grade 1-12 (MAX_GRADE_LEVELS). Checked up front in
// addGradeLevel so principals/admins get this message instead of a raw database error.
const MAX_GRADE_LEVELS = 12;

export const addGradeLevel = async ({ level_name, level_order, sy_id }) => {
  const cleanName = String(level_name ?? "").trim().replace(/\s+/g, " ");
  if (!cleanName) {
    throw new Error("Grade level name is required.");
  }

  // Default to the active school year when no sy_id is supplied.
  let syId = sy_id;
  if (syId == null) {
    const { data: sy, error: syErr } = await supabaseAdmin
      .from("school_year").select("sy_id").eq("is_active", true).single();
    if (syErr) {
      throw new Error(syErr.code === "PGRST116" ? "No active school year found." : syErr.message);
    }
    syId = sy.sy_id;
  }

  const { data: existingLevels, error: levelsErr } = await supabaseAdmin
    .from("grade_level")
    .select("gl_id, level_name, level_order")
    .eq("sy_id", syId);
  if (levelsErr) throw new Error(levelsErr.message);

  const duplicate = (existingLevels ?? []).some(
    (grade) => String(grade.level_name ?? "").trim().replace(/\s+/g, " ").toLowerCase() === cleanName.toLowerCase(),
  );
  if (duplicate) {
    const err = new Error(`${cleanName} already exists for this school year.`);
    err.statusCode = 409;
    throw err;
  }

  if ((existingLevels?.length ?? 0) >= MAX_GRADE_LEVELS) {
    throw new Error(`Maximum of ${MAX_GRADE_LEVELS} grade levels reached.`);
  }

  // Default level_order to the next slot for this school year (places it last).
  let order = level_order;
  if (order == null || order === "") {
    const usedOrders = new Set((existingLevels ?? []).map((grade) => Number(grade.level_order)));
    order = Array.from({ length: MAX_GRADE_LEVELS }, (_, index) => index + 1)
      .find((candidate) => !usedOrders.has(candidate));
  }
  const numericOrder = Number(order);
  if (!Number.isInteger(numericOrder) || numericOrder < 1 || numericOrder > MAX_GRADE_LEVELS) {
    const err = new Error(`Level order must be a whole number from 1 to ${MAX_GRADE_LEVELS}.`);
    err.statusCode = 400;
    throw err;
  }
  const orderOwner = (existingLevels ?? []).find(
    (grade) => Number(grade.level_order) === numericOrder,
  );
  if (orderOwner) {
    const err = new Error(`Level order ${numericOrder} is already used by ${orderOwner.level_name}.`);
    err.statusCode = 409;
    throw err;
  }

  const { data, error } = await supabaseAdmin
    .from("grade_level")
    .insert({ level_name: cleanName, level_order: numericOrder, sy_id: syId })
    .select()
    .single();
  if (error?.code === "23505") {
    const duplicateError = new Error(
      String(error.message).includes("uq_grade_level_sy_order")
        ? `Level order ${numericOrder} is already used by another grade level.`
        : `${cleanName} already exists for this school year.`,
    );
    duplicateError.statusCode = 409;
    throw duplicateError;
  }
  if (error) throw new Error(error.message);
  return data;
};

export const editGradeLevel = async (gl_id, { level_name }) => {
  const { data, error } = await supabaseAdmin
    .from("grade_level")
    .update({ level_name })
    .eq("gl_id", gl_id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
};

export const removeGradeLevel = async (gl_id) => {
  // Trap: never delete a grade level that still has students assigned. We check
  // explicitly (not relying on a DB foreign key, which could be CASCADE/SET NULL
  // and silently orphan or reassign students) and block with a clear message.
  const { count, error: countErr } = await supabaseAdmin
    .from("student")
    .select("student_id", { count: "exact", head: true })
    .eq("gl_id", gl_id);
  if (countErr) throw new Error(countErr.message);
  if (count > 0) {
    const err = new Error(
      `This grade level still has ${count} student${count === 1 ? "" : "s"} assigned. ` +
      `Reassign or remove them before deleting it.`
    );
    err.statusCode = 409; // Conflict — the frontend surfaces this message to the admin
    throw err;
  }

  const { error } = await supabaseAdmin
    .from("grade_level")
    .delete()
    .eq("gl_id", gl_id);
  if (error) throw new Error(error.message);
};

// The four academic quarters for a school year, as date ranges. This is the
// single source of truth for "what quarter is it" used across the app.
export function buildQuarterRanges(schoolYear) {
  const year  = new Date(schoolYear.start_date).getFullYear();
  const year2 = year + 1;
  return [
    { quarter: 1, label: "1st Quarter", start: new Date(`${year}-08-01`),  end: new Date(`${year}-10-31`)  },
    { quarter: 2, label: "2nd Quarter", start: new Date(`${year}-11-01`),  end: new Date(`${year}-12-31`)  },
    { quarter: 3, label: "3rd Quarter", start: new Date(`${year2}-01-01`), end: new Date(`${year2}-03-31`) },
    { quarter: 4, label: "4th Quarter", start: new Date(`${year2}-04-01`), end: new Date(`${year2}-06-30`) },
  ];
}

// The currently ACTIVE quarter (today falls within it). If today is between
// terms, fall back to the most recent quarter that has already started.
export function getCurrentQuarter(schoolYear) {
  const ranges = buildQuarterRanges(schoolYear);
  const today  = new Date();
  const active = ranges.find((q) => today >= q.start && today <= q.end);
  if (active) return active;
  const started = ranges.filter((q) => today >= q.start);
  return started.length ? started[started.length - 1] : ranges[0];
}

function buildQuarters(schoolYear) {
  const today = new Date();
  return buildQuarterRanges(schoolYear).map((q) => ({
    id: q.quarter,
    label: q.label,
    dateRange: `${fmt(q.start)} – ${fmt(q.end)}`,
    status: today < q.start ? "PENDING" : today > q.end ? "CLOSED" : "ACTIVE",
  }));
}

function fmt(d) {
  return d.toLocaleDateString("en-PH", { month: "short", year: "numeric" });
}

export const updateSchoolYear = async ({ sy_id, year_label, start_date, end_date }) => {
  return updateSchoolYearRecord(sy_id, { year_label, start_date, end_date });
};

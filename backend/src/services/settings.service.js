import { supabaseAdmin } from "../config/supabase.js";

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

export const addGradeLevel = async ({ level_name, level_order, sy_id }) => {
  if (!level_name || !String(level_name).trim()) {
    throw new Error("Grade level name is required.");
  }

  // Default to the active school year when no sy_id is supplied.
  let syId = sy_id;
  if (syId == null) {
    const { data: sy, error: syErr } = await supabaseAdmin
      .from("school_year").select("sy_id").eq("is_active", true).single();
    if (syErr) throw new Error("No active school year found.");
    syId = sy.sy_id;
  }

  // Default level_order to the next slot for this school year (places it last).
  let order = level_order;
  if (order == null || order === "") {
    const { data: rows } = await supabaseAdmin
      .from("grade_level").select("level_order").eq("sy_id", syId)
      .order("level_order", { ascending: false }).limit(1);
    order = (rows?.[0]?.level_order ?? 0) + 1;
  }

  const { data, error } = await supabaseAdmin
    .from("grade_level")
    .insert({ level_name: String(level_name).trim(), level_order: Number(order), sy_id: syId })
    .select()
    .single();
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
  const { data, error } = await supabaseAdmin
    .from("school_year")
    .update({ year_label, start_date, end_date })
    .eq("sy_id", sy_id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
};
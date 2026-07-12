import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { supabaseAdmin } from "../config/supabase.js";

// School info + system preferences are stored in a JSON file on disk (no DB table).
// NOTE: on ephemeral hosting (Render/Vercel/etc.) this file resets on redeploy.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.resolve(__dirname, "../data/school-settings.json");

const readSettings = async () => {
  try {
    const raw = await readFile(FILE, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") return {};   // not created yet
    throw err;
  }
};

const writeSettings = async (obj) => {
  await mkdir(path.dirname(FILE), { recursive: true });
  await writeFile(FILE, JSON.stringify(obj, null, 2), "utf8");
};

// read the school-settings JSON file (System Configuration)
export const getSchoolConfig = async () => {
  // JSON file settings + school-year rows (from the DB) in parallel
  const [setting, { data: years }] = await Promise.all([
    readSettings(),
    supabaseAdmin
      .from("school_year")
      .select("sy_id, year_label, is_active, start_date, end_date")
      .order("start_date", { ascending: false }),   // newest first
  ]);

  const schoolYears = years ?? [];
  const activeYear  = schoolYears.find((y) => y.is_active) ?? null; // the one active year

  return {
    setting,
    schoolYears,
    activeSyId:  activeYear?.sy_id ?? null,
    preferences: setting.preferences ?? {},
  };
};

// write the school-settings JSON file
export const updateSchoolConfig = async ({
  school_name,
  address,
  contact_number,
  email,
  principal_name,
  logo_url,
  current_sy_id,
  preferences,
}) => {
  const current = await readSettings();              // start from what's already on disk

  // overwrite the school-info fields, keeping everything else in the file
  const updated = {
    ...current,
    school_name:    school_name ?? null,
    address:        address ?? null,
    contact_number: contact_number ?? null,
    email:          email ?? null,
    principal_name: principal_name ?? null,
    updated_at:     new Date().toISOString(),
  };
  // Preserve the existing logo / preferences unless a new value is provided.
  if (logo_url !== undefined) updated.logo_url = logo_url;
  if (preferences !== undefined && preferences !== null) updated.preferences = preferences;

  await writeSettings(updated);                       // persist back to the JSON file

  // Switching the active school year still lives in the DB.
  if (current_sy_id) {
    const syId = parseInt(current_sy_id, 10);
    if (!Number.isNaN(syId)) {
      await supabaseAdmin.from("school_year").update({ is_active: false }).neq("sy_id", syId); // clear the others
      await supabaseAdmin.from("school_year").update({ is_active: true }).eq("sy_id", syId);   // then set this one active
    }
  }

  return updated;
};

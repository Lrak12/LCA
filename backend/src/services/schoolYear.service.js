import * as SchoolYearModel from "../models/schoolYear.model.js";

export const listSchoolYears = async () => {
  const { data, error } = await SchoolYearModel.findAll();
  if (error) throw new Error(error.message);
  return data ?? [];
};

export const createSchoolYear = async ({ year_label, start_date, end_date }) => {
  if (!year_label || !String(year_label).trim()) throw new Error("School year label is required.");
  if (!start_date || !end_date) throw new Error("Start date and end date are required.");
  if (new Date(end_date) <= new Date(start_date)) throw new Error("End date must be after the start date.");

  const { data, error } = await SchoolYearModel.create({
    year_label: String(year_label).trim(),
    start_date,
    end_date,
    is_active: false,
  });
  if (error) throw new Error(error.message);
  return data;
};

export const updateSchoolYear = async (sy_id, { year_label, start_date, end_date }) => {
  const payload = {};
  if (year_label != null) payload.year_label = String(year_label).trim();
  if (start_date != null) payload.start_date = start_date;
  if (end_date != null)   payload.end_date = end_date;
  if (payload.start_date && payload.end_date && new Date(payload.end_date) <= new Date(payload.start_date)) {
    throw new Error("End date must be after the start date.");
  }

  const { data, error } = await SchoolYearModel.update(sy_id, payload);
  if (error) throw new Error(error.message);
  return data;
};

// Flips every other school year inactive, then activates this one.
export const activateSchoolYear = async (sy_id) => {
  const { data, error } = await SchoolYearModel.setActive(sy_id);
  if (error) throw new Error(error.message);
  return data;
};

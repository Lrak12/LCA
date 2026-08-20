import * as SchoolYearModel from "../models/schoolYear.model.js";
import { getSchoolYearKey, validateSchoolYear } from "../helpers/schoolYearValidation.js";

const checkDuplicate = async (year_label, start_date, end_date, ignoredId = null) => {
  const { data: years, error } = await SchoolYearModel.findAll();
  if (error) throw new Error(error.message);

  const key = getSchoolYearKey(year_label);
  const duplicate = (years ?? []).find((year) =>
    Number(year.sy_id) !== Number(ignoredId) &&
    (getSchoolYearKey(year.year_label) === key ||
      (year.start_date === start_date && year.end_date === end_date))
  );

  if (duplicate) {
    const err = new Error("This school year already exists.");
    err.statusCode = 409;
    throw err;
  }
};

export const listSchoolYears = async () => {
  const { data, error } = await SchoolYearModel.findAll();
  if (error) throw new Error(error.message);
  return data ?? [];
};

export const createSchoolYear = async ({ year_label, start_date, end_date }) => {
  const clean = validateSchoolYear({ year_label, start_date, end_date });

  const { data: existingYears, error: yearsError } = await SchoolYearModel.findAll();
  if (yearsError) throw new Error(yearsError.message);
  const today = new Date().toISOString().slice(0, 10);
  const currentYear = (existingYears ?? []).find(
    (year) => year.start_date <= today && today <= year.end_date,
  );
  if (currentYear) {
    const err = new Error(
      `A new school year cannot be created until the current school year ${currentYear.year_label} ends on ${currentYear.end_date}.`,
    );
    err.statusCode = 409;
    throw err;
  }

  await checkDuplicate(clean.year_label, clean.start_date, clean.end_date);

  const { data, error } = await SchoolYearModel.create({
    ...clean,
    is_active: false,
  });
  if (error) throw new Error(error.message);
  return data;
};

export const updateSchoolYear = async (sy_id, { year_label, start_date, end_date }) => {
  const { data: oldYear, error: findError } = await SchoolYearModel.findById(sy_id);
  if (findError || !oldYear) throw new Error("School year not found.");

  const payload = validateSchoolYear(
    {
      year_label: year_label ?? oldYear.year_label,
      start_date: start_date ?? oldYear.start_date,
      end_date: end_date ?? oldYear.end_date,
    },
    { mustBeCurrent: oldYear.is_active }
  );
  await checkDuplicate(payload.year_label, payload.start_date, payload.end_date, sy_id);

  const { data, error } = await SchoolYearModel.update(sy_id, payload);
  if (error) throw new Error(error.message);
  return data;
};

// Flips every other school year inactive, then activates this one.
export const activateSchoolYear = async (sy_id, { allowHistorical = false } = {}) => {
  const { data: schoolYear, error: findError } = await SchoolYearModel.findById(sy_id);
  if (findError || !schoolYear) throw new Error("School year not found.");
  validateSchoolYear(schoolYear, {
    mustBeCurrent: true,
    allowOldLabel: true,
    allowPast: allowHistorical,
  });

  const { data, error } = await SchoolYearModel.setActive(sy_id);
  if (error) throw new Error(error.message);
  return data;
};

const STRICT_LABEL = /^SY (\d{4})-(\d{4})$/;
const OLD_LABEL = /^(?:SY\s+)?(\d{4})-(\d{4})$/i;
const DATE_TEXT = /^\d{4}-\d{2}-\d{2}$/;

const inputError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const readDate = (value, fieldName) => {
  if (!DATE_TEXT.test(String(value ?? ""))) {
    throw inputError(`${fieldName} must be a valid date.`);
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw inputError(`${fieldName} must be a valid date.`);
  }
  return date;
};

// Used for comparing new labels with older records that were saved without "SY ".
export const getSchoolYearKey = (label) => {
  const match = String(label ?? "").trim().match(OLD_LABEL);
  return match ? `${match[1]}-${match[2]}` : null;
};

export const validateSchoolYear = ({ year_label, start_date, end_date }, options = {}) => {
  const label = String(year_label ?? "").trim();
  const match = label.match(options.allowOldLabel ? OLD_LABEL : STRICT_LABEL);
  if (!match) {
    throw inputError("School Year must follow the format SY YYYY-YYYY (example: SY 2026-2027).");
  }

  const firstYear = Number(match[1]);
  const secondYear = Number(match[2]);
  if (secondYear !== firstYear + 1) {
    throw inputError("The second year must be exactly one year after the first year.");
  }

  const start = readDate(start_date, "Start date");
  const end = readDate(end_date, "End date");
  if (end <= start) throw inputError("End date must be after the start date.");
  if (start.getUTCFullYear() !== firstYear || end.getUTCFullYear() !== secondYear) {
    throw inputError("The School Year label must match the start and end date years.");
  }

  const lengthInDays = Math.round((end - start) / 86400000);
  if (lengthInDays < 180 || lengthInDays > 366) {
    throw inputError("School year dates must cover a realistic period of 180 to 366 days.");
  }

  if (options.mustBeCurrent) {
    const today = new Date().toISOString().slice(0, 10);
    if (today < start_date) {
      throw inputError("A future school year cannot be activated yet.");
    }
    if (today > end_date && !options.allowPast) {
      throw inputError("An outdated school year cannot be activated.");
    }
  }

  return { year_label: label, start_date, end_date };
};

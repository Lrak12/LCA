// Shared PH mobile-number validation for the contact-number fields.
// Contact numbers are optional, but when one IS entered it must look like a
// Philippine cellphone number. Accepts the common ways people write them:
//   09XXXXXXXXX     standard 11-digit local form
//   +639XXXXXXXXX   international form, with or without the leading +
//   9XXXXXXXXX      10-digit form typed after a "+63" prefix
// Spaces, dashes and parentheses are ignored. Landline numbers are not accepted.

export const PH_MOBILE_HINT = "Enter a valid PH mobile number (e.g. 09171234567).";

export function isPhMobile(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  return /^09\d{9}$/.test(digits) || /^639\d{9}$/.test(digits) || /^9\d{9}$/.test(digits);
}

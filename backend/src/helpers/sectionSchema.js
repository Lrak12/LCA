export const isSectionSchemaUnavailable = (error) =>
  ["42P01", "42703", "PGRST204", "PGRST205"].includes(error?.code)
  && /grade_section|section_id|student_section_assignment/i.test(error?.message ?? "");

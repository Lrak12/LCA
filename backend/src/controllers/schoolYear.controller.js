import * as SchoolYearService from "../services/schoolYear.service.js";
import { sendSuccess, sendCreated } from "../helpers/response.js";
import asyncHandler from "../helpers/asyncHandler.js";
import { writeAudit } from "../services/audit.service.js";

export const list = asyncHandler(async (req, res) => {
  const data = await SchoolYearService.listSchoolYears();
  sendSuccess(res, data);
});

export const create = asyncHandler(async (req, res) => {
  const data = await SchoolYearService.createSchoolYear(req.body);
  await writeAudit({
    user_id: req.user?.user_id,
    action: "CREATE",
    entity_affected: "School Year",
    entity_id: data.sy_id,
    details: `Created school year ${data.year_label}`,
  });
  sendCreated(res, data, "School year created");
});

export const update = asyncHandler(async (req, res) => {
  const sy_id = parseInt(req.params.sy_id, 10);
  const data = await SchoolYearService.updateSchoolYear(sy_id, req.body);
  await writeAudit({
    user_id: req.user?.user_id,
    action: "UPDATE",
    entity_affected: "School Year",
    entity_id: sy_id,
    details: `Updated school year ${data.year_label}`,
  });
  sendSuccess(res, data, "School year updated");
});

export const activate = asyncHandler(async (req, res) => {
  const sy_id = parseInt(req.params.sy_id, 10);
  const data = await SchoolYearService.activateSchoolYear(sy_id, {
    allowHistorical: req.body?.allow_historical === true,
  });
  await writeAudit({
    user_id: req.user?.user_id,
    action: "UPDATE",
    entity_affected: "School Year",
    entity_id: sy_id,
    details: `Set school year ${data.year_label} as active`,
  });
  sendSuccess(res, data, "Active school year updated");
});

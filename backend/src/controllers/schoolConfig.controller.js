import * as SchoolConfigService from "../services/schoolConfig.service.js";
import { sendSuccess } from "../helpers/response.js";
import asyncHandler from "../helpers/asyncHandler.js";
import { writeAudit } from "../services/audit.service.js";

export const getConfig = asyncHandler(async (req, res) => {
  const data = await SchoolConfigService.getSchoolConfig();
  sendSuccess(res, data);
});

export const updateConfig = asyncHandler(async (req, res) => {
  const data = await SchoolConfigService.updateSchoolConfig(req.body);
  await writeAudit({
    user_id: req.user?.user_id,
    action: "UPDATE",
    entity_affected: "Settings",
    details: "Updated system configuration settings",
  });
  sendSuccess(res, data, "School configuration saved");
});

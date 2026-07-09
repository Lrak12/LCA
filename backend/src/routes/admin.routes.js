import { Router } from "express";
import * as AdminUsersController from "../controllers/adminUsers.controller.js";
import * as SchoolConfigController from "../controllers/schoolConfig.controller.js";
import * as AuditController from "../controllers/audit.controller.js";
import * as SupportController from "../controllers/userSupport.controller.js";
import * as AccountController from "../controllers/account.controller.js";
import * as SchoolYearController from "../controllers/schoolYear.controller.js";
import { authenticate, requireRole } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(authenticate, requireRole("administrator"));

router.get("/account",           AccountController.getAccount);
router.put("/account",           AccountController.updateAccount);
router.post("/account/password", AccountController.changePassword);

router.get("/audit-logs", AuditController.getAuditLogs);

router.get("/support-requests",                 SupportController.getRequests);
router.put("/support-requests/:sr_id",          SupportController.respondToRequest);
router.post("/support-requests/:sr_id/reset-link", SupportController.sendResetLink);

router.get("/password-resets",                  SupportController.getPasswordResets);
router.post("/password-resets/:sr_id/process",  SupportController.processPasswordReset);

router.get("/users",                  AdminUsersController.getUsers);
router.post("/users",                 AdminUsersController.createUser);
router.put("/users/:user_id",         AdminUsersController.updateUser);
router.patch("/users/:user_id/status", AdminUsersController.updateUserStatus);

router.get("/permissions",            AdminUsersController.getRolePermissions);
router.patch("/permissions/:role",    AdminUsersController.updateRolePermission);

router.get("/school-config",  SchoolConfigController.getConfig);
router.put("/school-config",  SchoolConfigController.updateConfig);

router.get("/school-years",                  SchoolYearController.list);
router.post("/school-years",                 SchoolYearController.create);
router.put("/school-years/:sy_id",           SchoolYearController.update);
router.post("/school-years/:sy_id/activate", SchoolYearController.activate);

export default router;

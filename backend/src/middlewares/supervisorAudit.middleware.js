import { supabaseAdmin } from "../config/supabase.js";
import { writeAudit } from "../services/audit.service.js";

// These shared account handlers already write their own audit rows before sending
// the response. Skipping them here prevents duplicate entries for supervisors.
const ALREADY_AUDITED = new Set([
  "PUT /account",
  "POST /account/password",
  "POST /account/email/verify",
]);

const statusSummary = (records = []) => {
  const counts = records.reduce((result, record) => {
    const status = String(record?.status ?? "unmarked").trim().toLowerCase() || "unmarked";
    result[status] = (result[status] ?? 0) + 1;
    return result;
  }, {});
  return Object.entries(counts).map(([status, count]) => `${status}: ${count}`).join(", ");
};

const studentIdFrom = (req) => req.body?.student_id ?? req.params?.id ?? null;
const trailingPathId = (path) => path.split("/").filter(Boolean).at(-1) ?? null;

const describeMutation = (req, supervisorLabel) => {
  const path = req.path;
  const body = req.body ?? {};
  const studentId = studentIdFrom(req);
  const student = studentId != null ? `student (${studentId})` : "a student record";

  if (req.method === "POST" && path === "/attendance") {
    const records = Array.isArray(body.records) ? body.records : [];
    const breakdown = statusSummary(records);
    return {
      action: "UPDATE",
      entity: "Attendance",
      details: `${supervisorLabel} recorded attendance for ${records.length} student${records.length === 1 ? "" : "s"} on ${body.date || "the selected date"}${breakdown ? ` (${breakdown})` : ""}`,
    };
  }
  if (req.method === "PATCH" && path === "/student-record/grade") {
    const verb = body.score === "" || body.score == null ? "cleared" : `recorded ${body.score}`;
    return { action: "UPDATE", entity: "Grades", entityId: studentId, details: `${supervisorLabel} ${verb} for ${student}, ${body.subject || "subject"} PACE ${body.pace_number ?? "—"}` };
  }
  if (req.method === "POST" && path === "/student-record/note")
    return { action: "UPDATE", entity: "Student Notes", entityId: studentId, details: `${supervisorLabel} updated the supervisor note for ${student}` };
  if (req.method === "POST" && path === "/student-record/remarks")
    return { action: "UPDATE", entity: "Academic Remarks", entityId: studentId, details: `${supervisorLabel} updated academic remarks for ${student}` };
  if (req.method === "POST" && path === "/student-record/ready-next")
    return { action: "UPDATE", entity: "PACE Readiness", entityId: studentId, details: `${supervisorLabel} marked ${student} ready for the next PACE` };
  if (req.method === "PATCH" && /^\/student-record\/[^/]+\/profile$/.test(path))
  {
    const profileStudentId = path.split("/")[2];
    return { action: "UPDATE", entity: "Student Profile", entityId: profileStudentId, details: `${supervisorLabel} updated the profile of student (${profileStudentId})` };
  }
  if (req.method === "POST" && path === "/assessments/self-test/bulk")
    return { action: "UPDATE", entity: "Self-Test Results", details: `${supervisorLabel} saved ${body.records?.length ?? 0} self-test result${body.records?.length === 1 ? "" : "s"}` };
  if (req.method === "POST" && path === "/assessments/pace-test/bulk")
    return { action: "UPDATE", entity: "PACE Test Results", details: `${supervisorLabel} saved ${body.records?.length ?? 0} PACE test result${body.records?.length === 1 ? "" : "s"}` };
  if (req.method === "POST" && path === "/record-assessments/self-test")
    return { action: "CREATE", entity: "Self-Test Results", entityId: body.sp_id, details: `${supervisorLabel} recorded a self-test score of ${body.score} for student PACE (${body.sp_id})` };
  if (req.method === "POST" && path === "/record-assessments/self-test/reset")
    return { action: "DELETE", entity: "Self-Test Results", entityId: body.sp_id, details: `${supervisorLabel} reset self-test attempts for student PACE (${body.sp_id})` };
  if (req.method === "POST" && path === "/record-assessments/pace-test")
    return { action: "CREATE", entity: "PACE Test Results", entityId: body.sp_id, details: `${supervisorLabel} recorded a PACE test score of ${body.score} for student PACE (${body.sp_id})` };
  if (req.method === "POST" && path === "/student-pace-manage")
    return { action: "UPDATE", entity: "PACE Assignment", entityId: studentId, details: `${supervisorLabel} updated a PACE assignment for ${student}` };
  if (req.method === "POST" && path === "/assign-pace")
    return { action: "CREATE", entity: "PACE Projection", entityId: studentId, details: `${supervisorLabel} assigned a PACE projection to ${student}` };
  if (req.method === "PATCH" && path === "/pace-projection/cell")
    return { action: "UPDATE", entity: "PACE Projection", entityId: studentId, details: `${supervisorLabel} updated ${student}'s ${body.subject || "subject"} quarter ${body.quarter ?? "—"} PACE projection` };
  if (req.method === "PATCH" && path === "/pace-projection/status")
    return { action: "UPDATE", entity: "PACE Status", entityId: studentId, details: `${supervisorLabel} changed ${student}'s ${body.subject || "subject"} PACE status to ${body.status || "—"}` };
  if (req.method === "POST" && path === "/reports/submit")
    return { action: "CREATE", entity: "Reports", details: `${supervisorLabel} submitted the ${body.report_type || "school"} report for quarter ${body.quarter ?? "—"}` };
  if (req.method === "POST" && path === "/pace-test-schedule")
    return { action: "CREATE", entity: "PACE Test Schedule", entityId: studentId, details: `${supervisorLabel} scheduled ${student}'s ${body.subject || "subject"} PACE ${body.pace_number ?? "—"} test for ${body.scheduled_date || "the selected date"}` };
  if (req.method === "PATCH" && /^\/pace-test-schedule\/[^/]+$/.test(path))
  {
    const scheduleId = trailingPathId(path);
    return { action: "UPDATE", entity: "PACE Test Schedule", entityId: scheduleId, details: `${supervisorLabel} updated PACE test schedule (${scheduleId})` };
  }
  if (req.method === "DELETE" && /^\/pace-test-schedule\/[^/]+$/.test(path))
  {
    const scheduleId = trailingPathId(path);
    return { action: "DELETE", entity: "PACE Test Schedule", entityId: scheduleId, details: `${supervisorLabel} cancelled PACE test schedule (${scheduleId})` };
  }
  if (req.method === "POST" && path === "/account/email/request-code")
    return { action: "UPDATE", entity: "Account Settings", details: `${supervisorLabel} requested an email-change verification code` };
  if (req.method === "POST" && path === "/account/support-requests")
    return { action: "CREATE", entity: "User Support", details: `${supervisorLabel} submitted a support request` };

  return {
    action: req.method === "DELETE" ? "DELETE" : req.method === "POST" ? "CREATE" : "UPDATE",
    entity: "Supervisor Portal",
    entityId: studentId,
    details: `${supervisorLabel} performed ${req.method} ${path}`,
  };
};

const writeSupervisorMutation = async (req) => {
  const { data: teacher } = await supabaseAdmin
    .from("teacher")
    .select("teacher_id")
    .eq("user_id", req.user.user_id)
    .maybeSingle();
  const supervisorLabel = `Supervisor (${teacher?.teacher_id ?? req.user.user_id})`;
  const audit = describeMutation(req, supervisorLabel);
  await writeAudit({
    user_id: req.user.user_id,
    action: audit.action,
    entity_affected: audit.entity,
    entity_id: audit.entityId ?? null,
    details: audit.details,
  });
};

// Audit successful supervisor writes only. The response has already completed, so
// an audit-table outage cannot delay or break the user's original save action.
export const auditSuccessfulSupervisorMutation = (req, res, next) => {
  const key = `${req.method} ${req.path}`;
  const isWrite = ["POST", "PUT", "PATCH", "DELETE"].includes(req.method);
  if (req.user?.role === "teacher" && isWrite && !ALREADY_AUDITED.has(key)) {
    res.once("finish", () => {
      if (res.statusCode >= 200 && res.statusCode < 400) {
        void writeSupervisorMutation(req).catch((error) => console.error("supervisor audit failed:", error.message));
      }
    });
  }
  next();
};

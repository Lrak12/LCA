import { createBrowserRouter, Navigate } from "react-router-dom";
import Login          from "../pages/Login.jsx";
import PrincipalDashboard from "../pages/PrincipalDashboard.jsx";
import Employees      from "../pages/principal/Employees.jsx";
import StudentMonitoring from "../pages/principal/StudentMonitoring.jsx";
import Students          from "../pages/principal/Students.jsx";
import Reports        from "../pages/principal/Reports.jsx";
import SchoolSections from "../pages/principal/SchoolSections.jsx";
import DiagnosticAssessments from "../pages/principal/DiagnosticAssessments.jsx";
import SchoolYearRollover from "../pages/principal/SchoolYearRollover.jsx";
import AdminDashboard from "../pages/admin/AdminDashboard.jsx";
import UserManagement from "../pages/admin/UserManagement.jsx";
import SystemConfiguration from "../pages/admin/SystemConfiguration.jsx";
import AuditLogs from "../pages/admin/AuditLogs.jsx";
import UserSupport from "../pages/admin/UserSupport.jsx";
import AccountSettings from "../pages/admin/AccountSettings.jsx";
import ResetPassword from "../pages/ResetPassword.jsx";
import ForgotPassword from "../pages/ForgotPassword.jsx";
import ContactAdministrator from "../pages/ContactAdministrator.jsx";
import RecordDiagnostic      from "../pages/principal/RecordDiagnostic.jsx";
import ProjectedPaceRecommendation from "../pages/principal/ProjectedPaceRecommendation.jsx";
import Announcements from "../pages/principal/Announcements.jsx";
import Settings from "../pages/principal/Settings.jsx";
import PrincipalHelpCenter from "../pages/principal/HelpCenter.jsx";
import ProtectedRoute from "./ProtectedRoute.jsx";
import StudentDashboard from "../pages/student/StudentDashboard.jsx";
import PaceProgress       from "../pages/student/PaceProgress.jsx";
import AssessmentResults from "../pages/student/AssessmentResults.jsx";
import Grades           from "../pages/student/Grades.jsx";
import Attendance            from "../pages/student/Attendance.jsx";
import StudentAnnouncements  from "../pages/student/Announcements.jsx";
import StudentSettings       from "../pages/student/Settings.jsx";
import StudentHelpCenter     from "../pages/student/HelpCenter.jsx";
import TeacherDashboard        from "../pages/teacher/TeacherDashboard.jsx";
import AssignPace              from "../pages/teacher/AssignPace.jsx";
import PaceMonitoring          from "../pages/teacher/PaceMonitoring.jsx";
import PaceTestScheduling      from "../pages/teacher/PaceTestScheduling.jsx";
import ReturningStudentPlacement from "../pages/teacher/ReturningStudentPlacement.jsx";
import ScheduledPaceTests       from "../pages/teacher/ScheduledPaceTests.jsx";
import Assessments             from "../pages/teacher/Assessments.jsx";
import TeacherStudentMonitoring from "../pages/teacher/StudentMonitoring.jsx";
import TeacherAttendance        from "../pages/teacher/Attendance.jsx";
import TeacherReports           from "../pages/teacher/Reports.jsx";
import TeacherAnnouncements     from "../pages/teacher/Announcements.jsx";
import TeacherAccountSettings   from "../pages/teacher/AccountSettings.jsx";
import TeacherHelpCenter        from "../pages/teacher/HelpCenter.jsx";


const Placeholder = ({ role }) => (
  <div className="min-h-screen flex items-center justify-center bg-surface">
    <div className="text-center space-y-2">
      <p className="text-on-surface-variant font-body text-sm uppercase tracking-widest">{role}</p>
      <h1 className="text-primary font-headline font-extrabold text-3xl">Coming soon</h1>
    </div>
  </div>
);

export const router = createBrowserRouter([
  { path: "/",                 element: <Navigate to="/login" replace /> },
  { path: "/login",            element: <Login /> },
  { path: "/forgot-password",  element: <ForgotPassword /> },
  { path: "/contact-administrator", element: <ContactAdministrator /> },
  { path: "/reset-password",   element: <ResetPassword /> },

  {
    path: "/admin/dashboard",
    element: <ProtectedRoute allowedRoles={["principal", "administrator"]}><PrincipalDashboard /></ProtectedRoute>,
  },
  {
    path: "/admin/employees",
    element: <ProtectedRoute allowedRoles={["principal", "administrator"]}><Employees /></ProtectedRoute>,
  },
  {
    path: "/admin/enrollment",
    element: <ProtectedRoute allowedRoles={["principal", "administrator"]}><Placeholder role="Enrollment" /></ProtectedRoute>,
  },
  {
    path: "/admin/students",
    element: <ProtectedRoute allowedRoles={["principal", "administrator"]}><Students /></ProtectedRoute>,
  },
  {
    path: "/admin/sections",
    element: <ProtectedRoute allowedRoles={["principal", "administrator"]}><SchoolSections /></ProtectedRoute>,
  },
  {
    path: "/admin/diagnostic",
    element: <ProtectedRoute allowedRoles={["principal"]}><DiagnosticAssessments /></ProtectedRoute>,
  },
  {
    path: "/admin/rollover",
    element: <ProtectedRoute allowedRoles={["principal", "administrator"]}><SchoolYearRollover /></ProtectedRoute>,
  },
  {
    path: "/admin/diagnostic/record/:studentId",
    element: <ProtectedRoute allowedRoles={["principal"]}><RecordDiagnostic /></ProtectedRoute>,
  },
  {
    path: "/admin/diagnostic/recommendation/:studentId",
    element: <ProtectedRoute allowedRoles={["principal"]}><ProjectedPaceRecommendation /></ProtectedRoute>,
  },
  {
    path: "/admin/monitoring",
    element: <ProtectedRoute allowedRoles={["principal", "administrator"]}><StudentMonitoring /></ProtectedRoute>,
  },
  {
    path: "/admin/reports",
    element: <ProtectedRoute allowedRoles={["principal", "administrator"]}><Reports /></ProtectedRoute>,
  },
  {
    path: "/admin/announcements",
    element: <ProtectedRoute allowedRoles={["principal"]}><Announcements /></ProtectedRoute>,
  },
  {
    path: "/admin/settings",
    element: <ProtectedRoute allowedRoles={["principal", "administrator"]}><Settings /></ProtectedRoute>,
  },
  {
    path: "/admin/help",
    element: <ProtectedRoute allowedRoles={["principal", "administrator"]}><PrincipalHelpCenter /></ProtectedRoute>,
  },
  {
    path: "/sysadmin/dashboard",
    element: <ProtectedRoute allowedRoles={["administrator"]}><AdminDashboard /></ProtectedRoute>,
  },
  {
    path: "/sysadmin/users",
    element: <ProtectedRoute allowedRoles={["administrator"]}><UserManagement /></ProtectedRoute>,
  },
  {
    path: "/sysadmin/config",
    element: <ProtectedRoute allowedRoles={["administrator"]}><SystemConfiguration /></ProtectedRoute>,
  },
  {
    path: "/sysadmin/audit",
    element: <ProtectedRoute allowedRoles={["administrator"]}><AuditLogs /></ProtectedRoute>,
  },
  {
    path: "/sysadmin/support",
    element: <ProtectedRoute allowedRoles={["administrator"]}><UserSupport /></ProtectedRoute>,
  },
  {
    path: "/sysadmin/settings",
    element: <ProtectedRoute allowedRoles={["administrator"]}><AccountSettings /></ProtectedRoute>,
  },
  {
    path: "/teacher/dashboard",
    element: <ProtectedRoute allowedRoles={["teacher"]}><TeacherDashboard /></ProtectedRoute>,
  },
  {
    path: "/teacher/assign-pace",
    element: <ProtectedRoute allowedRoles={["teacher"]}><AssignPace /></ProtectedRoute>,
  },
  {
    path: "/teacher/pace",
    element: <ProtectedRoute allowedRoles={["teacher"]}><PaceMonitoring /></ProtectedRoute>,
  },
  {
    path: "/teacher/pace/schedule-test",
    element: <ProtectedRoute allowedRoles={["teacher"]}><PaceTestScheduling /></ProtectedRoute>,
  },
  {
    path: "/teacher/pace/returning-placement",
    element: <ProtectedRoute allowedRoles={["teacher"]}><ReturningStudentPlacement /></ProtectedRoute>,
  },
  {
    path: "/teacher/pace/scheduled-tests",
    element: <ProtectedRoute allowedRoles={["teacher"]}><ScheduledPaceTests /></ProtectedRoute>,
  },
  {
    path: "/teacher/assessments",
    element: <ProtectedRoute allowedRoles={["teacher"]}><Assessments /></ProtectedRoute>,
  },
  {
    path: "/teacher/students",
    element: <ProtectedRoute allowedRoles={["teacher"]}><TeacherStudentMonitoring /></ProtectedRoute>,
  },
  {
    path: "/teacher/attendance",
    element: <ProtectedRoute allowedRoles={["teacher"]}><TeacherAttendance /></ProtectedRoute>,
  },
  {
    path: "/teacher/reports",
    element: <ProtectedRoute allowedRoles={["teacher"]}><TeacherReports /></ProtectedRoute>,
  },
  {
    path: "/teacher/announcements",
    element: <ProtectedRoute allowedRoles={["teacher"]}><TeacherAnnouncements /></ProtectedRoute>,
  },
  {
    path: "/teacher/settings",
    element: <ProtectedRoute allowedRoles={["teacher"]}><TeacherAccountSettings /></ProtectedRoute>,
  },
  {
    path: "/teacher/help",
    element: <ProtectedRoute allowedRoles={["teacher"]}><TeacherHelpCenter /></ProtectedRoute>,
  },
  {
    path: "/student/dashboard",
    element: <ProtectedRoute allowedRoles={["student"]}><StudentDashboard /></ProtectedRoute>,
  },
  {
    path: "/parent/dashboard",
    element: <ProtectedRoute allowedRoles={["parent"]}><Placeholder role="Parent Portal" /></ProtectedRoute>,
  },
  {
    path: "/student/pace",
    element: <ProtectedRoute allowedRoles={["student"]}><PaceProgress /></ProtectedRoute>,
  },
  {
    path: "/student/assessments",
    element: <ProtectedRoute allowedRoles={["student"]}><AssessmentResults /></ProtectedRoute>,
  },
  {
    path: "/student/grades",
    element: <ProtectedRoute allowedRoles={["student"]}><Grades /></ProtectedRoute>,
  },
  {
    path: "/student/attendance",
    element: <ProtectedRoute allowedRoles={["student"]}><Attendance /></ProtectedRoute>,
  },
  {
    path: "/student/announcements",
    element: <ProtectedRoute allowedRoles={["student"]}><StudentAnnouncements /></ProtectedRoute>,
  },
  {
    path: "/student/settings",
    element: <ProtectedRoute allowedRoles={["student"]}><StudentSettings /></ProtectedRoute>,
  },
  {
    path: "/student/help",
    element: <ProtectedRoute allowedRoles={["student"]}><StudentHelpCenter /></ProtectedRoute>,
  },
]);


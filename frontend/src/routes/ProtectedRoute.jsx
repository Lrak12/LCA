import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

const ROLE_DASHBOARDS = {
  principal:     "/admin/dashboard",
  administrator: "/admin/dashboard",
  teacher:       "/teacher/dashboard",
  student:       "/student/dashboard",
};

export default function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <span className="material-symbols-outlined text-primary text-4xl animate-spin">
          progress_activity
        </span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    const fallback = ROLE_DASHBOARDS[user.role] ?? "/login";
    return <Navigate to={fallback} replace />;
  }

  return children;
}

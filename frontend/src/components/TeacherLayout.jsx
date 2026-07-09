import { useAuth } from "../context/AuthContext.jsx";
import { useNavigate, useLocation } from "react-router-dom";
import NotificationBell from "./NotificationBell.jsx";

const fillStyle = { fontVariationSettings: '"FILL" 1' };

const navItems = [
  { icon: "dashboard",       label: "Dashboard",          path: "/teacher/dashboard"   },
  { icon: "menu_book",       label: "PACE Monitoring",    path: "/teacher/pace"        },
  { icon: "assignment",      label: "Record Assessments", path: "/teacher/assessments" },
  { icon: "group",           label: "Student Monitoring", path: "/teacher/students"    },
  { icon: "event_available", label: "Attendance Records", path: "/teacher/attendance"  },
  { icon: "campaign",        label: "Announcements",      path: "/teacher/announcements" },
  { icon: "bar_chart",       label: "Reports",            path: "/teacher/reports"     },
  { icon: "settings",        label: "Account Settings",   path: "/teacher/settings"    },
];

export default function TeacherLayout({ children, schoolYearLabel = "—" }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const displayName    = user?.first_name && user?.last_name
    ? `${user.first_name} ${user.last_name}`
    : user?.fullName || user?.username || "Teacher User";
  const avatarInitials = displayName.slice(0, 2).toUpperCase();

  return (
    <div className="bg-background text-on-background font-body antialiased min-h-screen">

      {/* Sidebar */}
      <aside className="h-screen w-64 fixed left-0 top-0 flex flex-col bg-surface z-50">
        <div className="flex flex-col h-full py-6 px-5">

          {/* Logo */}
          <div className="mb-10 px-2 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center text-white shadow-lg">
              <span className="material-symbols-outlined" style={fillStyle}>school</span>
            </div>
            <div>
              <h1 className="text-lg font-bold text-primary tracking-tight font-headline">LCA Supervisor</h1>
              <p className="text-[9px] uppercase tracking-[0.18em] text-secondary font-semibold">Academic Sanctuary</p>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 space-y-2">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              const base     = "flex items-center gap-4 px-4 py-3 rounded-lg transition-all duration-200 text-sm";
              const active   = "bg-primary text-white font-bold shadow-lg shadow-primary/20";
              const inactive = "text-on-primary-container hover:bg-surface-container-low hover:text-primary";
              return (
                <a
                  key={item.label}
                  href="#"
                  onClick={(e) => { e.preventDefault(); navigate(item.path); }}
                  className={`${base} ${isActive ? active : inactive}`}
                >
                  <span className="material-symbols-outlined text-xl" style={isActive ? fillStyle : undefined}>
                    {item.icon}
                  </span>
                  {item.label}
                </a>
              );
            })}
          </nav>

          {/* Bottom */}
          <div className="mt-4 pt-4 border-t border-outline-variant/20">
            <button className="flex items-center gap-3 text-on-surface-variant px-3 py-2 hover:text-primary transition-colors w-full text-sm">
              <span className="material-symbols-outlined text-xl">help_outline</span>
              Help Center
            </button>
          </div>
        </div>
      </aside>

      {/* Top Bar */}
      <header
        className="w-full h-16 sticky top-0 z-40 bg-surface flex justify-between items-center px-8 border-b border-outline-variant/20"
        style={{ marginLeft: "16rem", maxWidth: "calc(100% - 16rem)" }}
      >
        <div className="flex items-center gap-4">
          <div className="w-1 h-8 rounded-full bg-primary" />
          <span className="text-xl font-extrabold text-primary font-headline tracking-tight">
            Lifegiver Christian Academy
          </span>
          <span className="text-secondary font-bold border-b-2 border-secondary text-sm tracking-widest uppercase">
            {schoolYearLabel !== "—" ? `SY ${schoolYearLabel}` : "—"}
          </span>
        </div>

        <div className="flex items-center gap-5">
          <NotificationBell />
          <div className="h-8 w-px bg-outline-variant/30" />
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-bold text-on-surface leading-tight">{displayName}</p>
              <p className="text-xs text-on-surface-variant leading-tight">Supervisor</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-primary-container flex items-center justify-center text-on-primary-container font-bold text-sm shadow-sm">
              {avatarInitials}
            </div>
          </div>
        </div>
      </header>

      {/* Page Content */}
      <div style={{ marginLeft: "16rem" }}>
        {children}
      </div>
    </div>
  );
}

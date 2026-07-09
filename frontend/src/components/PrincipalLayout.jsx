import { useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { useNavigate, useLocation } from "react-router-dom";
import HelpCenterModal from "./HelpCenterModal.jsx";
import NotificationBell from "./NotificationBell.jsx";

const fillStyle = { fontVariationSettings: '"FILL" 1' };

const navItems = [
  { icon: "dashboard",      label: "Dashboard",            path: "/admin/dashboard"     },
  { icon: "groups",         label: "Supervisor Management", path: "/admin/employees"     },
  //{ icon: "group",          label: "Students",             path: "/admin/students"      }, comment for now this is for testing 
  { icon: "visibility",     label: "Student Monitoring",   path: "/admin/monitoring"    },
  { icon: "corporate_fare", label: "Grade level",      path: "/admin/sections"      },
  { icon: "assessment",     label: "Reports",              path: "/admin/reports"       },
  { icon: "campaign",       label: "Announcements",        path: "/admin/announcements" },
  { icon: "assignment",     label: "Diagnostic Assessment", path: "/admin/diagnostic"   },
  //{ icon: "autorenew",      label: "New School Year",      path: "/admin/rollover"      },
  { icon: "settings",       label: "Settings",             path: "/admin/settings"      },
];

export default function PrincipalLayout({ children, schoolYearLabel = "—" }) {
  const { user, logout } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();
  const [showHelp, setShowHelp] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  // Derive display name and role from user object
  const displayName = user?.fullName || user?.username || "Admin User";
  const displayRole = user?.role || "Head Administrator";
  const avatarInitials = displayName.slice(0, 2).toUpperCase();

  return (
    <div className="bg-background text-on-background font-body antialiased min-h-screen">
      {showHelp && <HelpCenterModal onClose={() => setShowHelp(false)} />}

      {/* Sidebar */}
      <aside className="h-screen w-64 fixed left-0 top-0 flex flex-col bg-surface z-50">
        <div className="flex flex-col h-full py-6 px-5">

          <div className="mb-10 px-2 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center text-white shadow-lg">
              <span className="material-symbols-outlined" style={fillStyle}>school</span>
            </div>
            <div>
              <h1 className="text-lg font-bold text-primary tracking-tight font-headline">LCA Principal</h1>
              <p className="text-[9px] uppercase tracking-[0.18em] text-secondary font-semibold">Academic Sanctuary</p>
            </div>
          </div>

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
                  <span className="material-symbols-outlined text-xl" style={isActive ? fillStyle : undefined}>{item.icon}</span>
                  {item.label}
                </a>
              );
            })}
          </nav>

          <div className="mt-auto pt-6 border-t border-outline-variant/20">
            <button
              onClick={() => setShowHelp(true)}
              className="flex items-center gap-3 text-on-surface-variant px-3 py-2 hover:text-primary transition-colors w-full text-sm"
            >
              <span className="material-symbols-outlined">help_outline</span>
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
        {/* Left: accent border + school name + SY */}
        <div className="flex items-center gap-4">
          {/* Left accent bar */}
          <div className="w-1 h-8 rounded-full bg-primary" />
          <span className="text-xl font-extrabold text-primary font-headline tracking-tight">
            Lifegiver Christian Academy
          </span>
          <span className="text-secondary font-bold border-b-2 border-secondary text-sm tracking-widest uppercase">
            {schoolYearLabel !== "—" ? `SY ${schoolYearLabel}` : "—"}
          </span>
        </div>

        {/* Right: notification bell + user info + avatar */}
        <div className="flex items-center gap-5">

          <NotificationBell />

          {/* Divider */}
          <div className="h-8 w-px bg-outline-variant/30" />

          {/* User info + avatar */}
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-bold text-on-surface leading-tight">{displayName}</p>
              <p className="text-xs text-on-surface-variant leading-tight">{displayRole}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-primary-container flex items-center justify-center text-on-primary-container font-bold text-sm shadow-sm overflow-hidden">
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt={displayName} className="w-full h-full object-cover" />
              ) : (
                avatarInitials
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Page Content */}
      {/* min-h is viewport minus the 4rem (h-16) sticky header so a short page
          still pins the footer to the bottom without forcing an extra scroll */}
      <div style={{ marginLeft: "16rem" }} className="flex flex-col min-h-[calc(100vh-4rem)]">
        <div className="flex-1">
          {children}
        </div>

        {/* Footer */}
        <footer className="w-full bg-[#0d1b2e] py-4 flex items-center justify-center">
          <p className="text-white text-sm font-semibold tracking-wide">
            @2026 All Rights Reserved
          </p>
        </footer>
      </div>
    </div>
  );
}

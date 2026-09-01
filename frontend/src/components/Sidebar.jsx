import React, { useEffect } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import {
  LayoutDashboard,
  CalendarClock,
  Users,
  UserCog,
  Car,
  Wallet,
  Plane,
  LineChart,
  FileBarChart,
  Settings,
  LogOut,
  X,
  MessageSquareQuote,
} from "lucide-react";

const nav = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard", roles: ["super_admin", "operator"] },
  { to: "/enquiries", icon: MessageSquareQuote, label: "Enquiries & Leads", roles: ["super_admin", "operator"] },
  { to: "/bookings", icon: CalendarClock, label: "Bookings", roles: ["super_admin", "operator"] },
  { to: "/transfers", icon: Plane, label: "Airport Transfers", roles: ["super_admin", "operator"] },
  { to: "/owners", icon: Users, label: "Car Owners", roles: ["super_admin", "operator"] },
  { to: "/agents", icon: UserCog, label: "Car Drivers", roles: ["super_admin"] },
  { to: "/cars", icon: Car, label: "Cars", roles: ["super_admin"] },
  { to: "/ledger", icon: Wallet, label: "Payouts & Dues", roles: ["super_admin"] },
  { to: "/finance", icon: LineChart, label: "Finance & Savings", roles: ["super_admin"] },
  { to: "/reports", icon: FileBarChart, label: "Reports", roles: ["super_admin"] },
  { to: "/settings", icon: Settings, label: "Settings", roles: ["super_admin"] },
];

export default function Sidebar({ mobileOpen = false, onClose }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Close mobile drawer on route change
  useEffect(() => {
    if (onClose) onClose();
  }, [location.pathname]); // eslint-disable-line

  if (!user) return null;

  const items = nav.filter((n) => n.roles.includes(user.role));

  const content = (
    <div className="h-full flex flex-col justify-between bg-[#20373B] text-slate-100 border-r border-[#2C494E]">
      <div>
        {/* Brand Header */}
        <div className="px-5 py-4 border-b border-[#2C494E] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/logo.jpeg"
              alt="Car Castle Goa Logo"
              className="w-9 h-9 rounded-lg object-cover shadow-md border border-[#FFC64F]/40 shrink-0 bg-white"
            />
            <div>
              <div className="font-display font-bold text-white text-[15px] leading-tight tracking-wide">
                Car Castle
              </div>
              <div className="text-[10px] text-[#FFC64F] uppercase tracking-widest font-bold">Goa</div>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="lg:hidden p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-[#2C494E] transition-colors"
              aria-label="Close menu"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Navigation links */}
        <nav className="px-3 py-3 overflow-y-auto max-h-[calc(100vh-210px)] space-y-1">
          {items.map((n) => {
            const Icon = n.icon;
            return (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === "/"}
                data-testid={`nav-${n.label.toLowerCase().replace(/\s+/g, "-")}`}
                className={({ isActive }) =>
                  `sidebar-link flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13.5px] font-medium transition-all ${
                    isActive
                      ? "bg-[#519CAB]/30 text-[#FFC64F] border-l-4 border-[#FFC64F] pl-[10px] shadow-sm font-semibold"
                      : "text-slate-300 hover:bg-[#2C494E] hover:text-[#C3E7F1]"
                  }`
                }
              >
                <Icon className="w-[18px] h-[18px] shrink-0" strokeWidth={2} />
                <span className="truncate">{n.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* User profile footer */}
      <div className="p-3 border-t border-[#2C494E] bg-[#16272A]/70">
        <div className="px-3 py-1.5">
          <div className="text-[10px] uppercase text-[#C3E7F1]/70 tracking-widest font-semibold">
            Signed in as
          </div>
          <div className="text-sm text-white font-semibold truncate" data-testid="current-user-name">
            {user.name}
          </div>
          <div className="text-[11px] text-slate-300 truncate">{user.email}</div>
          <div className="mt-1.5 inline-block text-[10px] font-bold uppercase tracking-widest text-[#FFC64F] border border-[#FFC64F]/40 bg-[#FFC64F]/15 px-2 py-0.5 rounded-md">
            {user.role === "super_admin" ? "Super Admin" : "Operator"}
          </div>
        </div>
        <button
          onClick={async () => {
            if (onClose) onClose();
            await logout();
            navigate("/login");
          }}
          className="mt-2 w-full flex items-center gap-2 px-3 py-2 text-[13px] rounded-lg text-slate-300 hover:bg-[#2C494E] hover:text-[#FFC64F] transition-colors font-medium cursor-pointer"
          data-testid="logout-button"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar (Permanent) */}
      <aside
        className="hidden lg:flex fixed left-0 top-0 h-screen w-64 flex-col z-30 shadow-xl"
        data-testid="sidebar"
      >
        {content}
      </aside>

      {/* Mobile Drawer (Slide-out Overlay) */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          {/* Backdrop blur */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-fade-in"
            onClick={onClose}
          />
          {/* Slide-out Panel */}
          <div className="relative w-72 max-w-[85vw] h-full shadow-2xl z-10 animate-slide-right">
            {content}
          </div>
        </div>
      )}
    </>
  );
}

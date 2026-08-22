import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
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
} from "lucide-react";

const nav = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard", roles: ["super_admin", "operator"] },
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

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;

  const items = nav.filter((n) => n.roles.includes(user.role));

  return (
    <aside
      className="fixed left-0 top-0 h-screen w-60 bg-[#20373B] text-slate-100 flex flex-col z-30 border-r border-[#2C494E] shadow-xl"
      data-testid="sidebar"
    >
      <div className="px-5 py-5 border-b border-[#2C494E]">
        <div className="flex items-center gap-3">
          <img
            src="/logo.jpeg"
            alt="Car Castle Goa Logo"
            className="w-10 h-10 rounded-lg object-cover shadow-md border border-[#FFC64F]/40 shrink-0 bg-white"
          />
          <div>
            <div className="font-display font-bold text-white text-[16px] leading-tight tracking-wide">
              Car Castle
            </div>
            <div className="text-[10px] text-[#FFC64F] uppercase tracking-widest font-bold">Goa</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-1">
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
              <Icon className="w-[18px] h-[18px]" strokeWidth={2} />
              <span>{n.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="p-3 border-t border-[#2C494E] bg-[#16272A]/50">
        <div className="px-3 py-2">
          <div className="text-[10px] uppercase text-[#C3E7F1]/70 tracking-widest mb-1 font-semibold">
            Signed in
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
            await logout();
            navigate("/login");
          }}
          className="mt-2 w-full flex items-center gap-2 px-3 py-2 text-[13px] rounded-lg text-slate-300 hover:bg-[#2C494E] hover:text-[#FFC64F] transition-colors font-medium"
          data-testid="logout-button"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}

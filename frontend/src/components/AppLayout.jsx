import React, { useState } from "react";
import { NavLink } from "react-router-dom";
import Sidebar from "@/components/Sidebar";
import { useAuth } from "@/context/AuthContext";
import {
  Menu,
  LayoutDashboard,
  CalendarClock,
  Plane,
  Wallet,
  MoreHorizontal,
} from "lucide-react";

export default function AppLayout({ children, title, subtitle, actions }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";

  return (
    <div className="min-h-screen bg-[#F4FAFC] flex flex-col selection:bg-[#FFC64F]/30 selection:text-[#20373B]">
      {/* Sidebar with mobile drawer support */}
      <Sidebar
        mobileOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
      />

      {/* Main Content Area */}
      <div className="lg:ml-64 flex-1 flex flex-col min-w-0">
        
        {/* Sticky Responsive Header */}
        <header className="sticky top-0 z-20 backdrop-blur-md bg-white/95 border-b border-[#C3E7F1]/80 shadow-xs">
          <div className="px-3 sm:px-6 lg:px-8 py-3 sm:py-4 flex items-center justify-between gap-2">
            
            {/* Left: Mobile hamburger + Page Title */}
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="lg:hidden p-2 rounded-xl bg-[#F4FAFC] border border-[#C3E7F1] text-[#20373B] hover:bg-[#C3E7F1]/30 active:scale-95 transition-all shrink-0"
                aria-label="Open navigation menu"
                data-testid="mobile-menu-button"
              >
                <Menu className="w-5 h-5 text-[#20373B]" />
              </button>

              <img
                src="/logo.jpeg"
                alt="Car Castle Goa Logo"
                className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl object-cover shadow-xs border border-[#C3E7F1] shrink-0 bg-white"
              />

              <div className="min-w-0">
                <h1
                  className="font-display text-base sm:text-2xl font-extrabold tracking-tight text-[#20373B] truncate leading-tight"
                  data-testid="page-title"
                >
                  {title}
                </h1>
                {subtitle && (
                  <p className="text-[11px] sm:text-sm font-medium text-[#519CAB] truncate hidden sm:block">
                    {subtitle}
                  </p>
                )}
              </div>
            </div>

            {/* Right: Header Actions */}
            {actions && (
              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                {actions}
              </div>
            )}
          </div>
          
          {/* Subtitle bar on extra-small screens */}
          {subtitle && (
            <div className="px-3.5 pb-2 text-[11px] font-medium text-[#519CAB] sm:hidden truncate border-t border-[#C3E7F1]/40 pt-1.5">
              {subtitle}
            </div>
          )}
        </header>

        {/* Page Content with safe padding for mobile bottom bar */}
        <main className="flex-1 px-3 sm:px-6 lg:px-8 py-3.5 sm:py-6 pb-24 lg:pb-8 max-w-7xl w-full mx-auto">
          {children}
        </main>

        {/* 📱 Native Mobile Bottom Navigation Bar (<lg screens) */}
        <nav
          className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-[#C3E7F1] px-2 py-1.5 flex items-center justify-around shadow-lg safe-area-bottom"
          aria-label="Mobile Navigation"
        >
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all ${
                isActive
                  ? "text-[#20373B] font-bold bg-[#FFC64F]/30 scale-105"
                  : "text-slate-500 hover:text-[#20373B] font-medium"
              }`
            }
          >
            <LayoutDashboard className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] tracking-tight">Dashboard</span>
          </NavLink>

          <NavLink
            to="/bookings"
            className={({ isActive }) =>
              `flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all ${
                isActive
                  ? "text-[#20373B] font-bold bg-[#FFC64F]/30 scale-105"
                  : "text-slate-500 hover:text-[#20373B] font-medium"
              }`
            }
          >
            <CalendarClock className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] tracking-tight">Bookings</span>
          </NavLink>

          <NavLink
            to="/transfers"
            className={({ isActive }) =>
              `flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all ${
                isActive
                  ? "text-[#20373B] font-bold bg-[#FFC64F]/30 scale-105"
                  : "text-slate-500 hover:text-[#20373B] font-medium"
              }`
            }
          >
            <Plane className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] tracking-tight">Transfers</span>
          </NavLink>

          {isSuperAdmin && (
            <NavLink
              to="/ledger"
              className={({ isActive }) =>
                `flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all ${
                  isActive
                    ? "text-[#20373B] font-bold bg-[#FFC64F]/30 scale-105"
                    : "text-slate-500 hover:text-[#20373B] font-medium"
                }`
              }
            >
              <Wallet className="w-5 h-5 mb-0.5" />
              <span className="text-[10px] tracking-tight">Payouts</span>
            </NavLink>
          )}

          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="flex flex-col items-center justify-center py-1 px-2.5 rounded-xl text-slate-500 hover:text-[#20373B] transition-all cursor-pointer font-medium"
          >
            <MoreHorizontal className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] tracking-tight">More</span>
          </button>
        </nav>
      </div>
    </div>
  );
}

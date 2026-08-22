import React, { useState } from "react";
import Sidebar from "@/components/Sidebar";
import { Menu } from "lucide-react";

export default function AppLayout({ children, title, subtitle, actions }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#F4FAFC] flex flex-col">
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
                className="lg:hidden p-2 rounded-lg bg-[#F4FAFC] border border-[#C3E7F1] text-[#20373B] hover:bg-[#C3E7F1]/30 transition-colors shrink-0"
                aria-label="Open navigation menu"
                data-testid="mobile-menu-button"
              >
                <Menu className="w-5 h-5 text-[#20373B]" />
              </button>

              <img
                src="/logo.jpeg"
                alt="Car Castle Goa Logo"
                className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg object-cover shadow-xs border border-[#C3E7F1] shrink-0 bg-white"
              />

              <div className="min-w-0">
                <h1
                  className="font-display text-lg sm:text-2xl font-extrabold tracking-tight text-[#20373B] truncate"
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

            {/* Right: Header Actions (responsive wrapped) */}
            {actions && (
              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                {actions}
              </div>
            )}
          </div>
          
          {/* Subtitle bar on extra-small screens if available */}
          {subtitle && (
            <div className="px-4 pb-2 text-[11px] font-medium text-[#519CAB] sm:hidden truncate border-t border-[#C3E7F1]/40 pt-1.5">
              {subtitle}
            </div>
          )}
        </header>

        {/* Page Content */}
        <main className="flex-1 px-3 sm:px-6 lg:px-8 py-4 sm:py-6 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

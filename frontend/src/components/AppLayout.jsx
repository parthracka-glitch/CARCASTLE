import React from "react";
import Sidebar from "@/components/Sidebar";

export default function AppLayout({ children, title, subtitle, actions }) {
  return (
    <div className="min-h-screen bg-[#F4FAFC]">
      <Sidebar />
      <main className="ml-60">
        <header className="sticky top-0 z-20 backdrop-blur-md bg-white/90 border-b border-[#C3E7F1]/80 shadow-xs">
          <div className="px-8 py-4 flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <img
                src="/logo.jpeg"
                alt="Car Castle Goa Logo"
                className="w-10 h-10 rounded-lg object-cover shadow-sm border border-[#C3E7F1] shrink-0 bg-white"
              />
              <div>
                <h1 className="font-display text-2xl font-extrabold tracking-tight text-[#20373B]" data-testid="page-title">
                  {title}
                </h1>
                {subtitle && (
                  <p className="text-sm font-medium text-[#519CAB] mt-0.5">{subtitle}</p>
                )}
              </div>
            </div>
            {actions && <div className="flex items-center gap-2">{actions}</div>}
          </div>
        </header>
        <div className="px-8 py-8">{children}</div>
      </main>
    </div>
  );
}

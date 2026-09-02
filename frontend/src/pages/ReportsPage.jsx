import React, { useState } from "react";
import AppLayout from "@/components/AppLayout";
import { API } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileText, Table2, Download, Calendar, Layers } from "lucide-react";
import { toast } from "sonner";

export default function ReportsPage() {
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [reportRange, setReportRange] = useState("3-months"); // "3-months" | "all" | "month"
  const [month, setMonth] = useState(defaultMonth);
  const [downloading, setDownloading] = useState(false);

  const getQueryParam = () => {
    if (reportRange === "3-months") return "month=3-months";
    if (reportRange === "all") return "month=all";
    return `month=${month}`;
  };

  const getLabel = () => {
    if (reportRange === "3-months") return "Last 3 Months";
    if (reportRange === "all") return "All-Time";
    return month;
  };

  const downloadReport = async (kind, endpoint = "monthly") => {
    setDownloading(true);
    const queryParam = getQueryParam();
    const url = `${API}/reports/${endpoint}.${kind}?${queryParam}`;
    try {
      const res = await fetch(url, {
        credentials: "include",
        headers: (() => {
          const t = localStorage.getItem("ccg_token");
          return t ? { Authorization: `Bearer ${t}` } : {};
        })(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || res.statusText);
      }
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      const filenameLabel = reportRange === "all" ? "all-time" : reportRange === "3-months" ? "last-3-months" : month;
      const prefix = endpoint === "clients" ? "car-castle-goa-clients" : "car-castle-goa";
      a.download = `${prefix}-${filenameLabel}.${kind}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success(`${kind.toUpperCase()} ${endpoint === "clients" ? "Client Directory" : "Report"} downloaded successfully!`);
    } catch (e) {
      toast.error(e.message || "Failed to download report");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <AppLayout
      title="Reports & Exports"
      subtitle="Download live synchronized branded PDF reports and multi-sheet Excel workbooks anytime."
    >
      <div className="max-w-3xl space-y-6">
        <div className="bg-white border border-[#C3E7F1] rounded-2xl p-6 shadow-xs space-y-6">
          <div>
            <div className="font-display font-bold text-xl text-[#20373B] mb-1">
              Live Fleet & Client Export Center
            </div>
            <div className="text-xs text-slate-500">
              Synchronized with live bookings database. Filter by Last 3 Months, All-Time, or custom months with complete data recovery guarantee.
            </div>
          </div>

          {/* Time Scope Selector */}
          <div className="space-y-3 bg-[#F4FAFC] p-4 rounded-xl border border-[#C3E7F1]">
            <Label className="text-xs font-bold text-[#20373B] uppercase tracking-wider block">
              1. Choose Report Time Period
            </Label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setReportRange("3-months")}
                className={`p-3 rounded-xl border text-left transition-all ${
                  reportRange === "3-months"
                    ? "bg-[#20373B] text-white border-[#20373B] shadow-xs"
                    : "bg-white text-slate-700 border-[#C3E7F1] hover:border-[#519CAB]"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Calendar className={`w-4 h-4 ${reportRange === "3-months" ? "text-[#FFC64F]" : "text-[#519CAB]"}`} />
                  <span className="font-bold text-xs">Last 3 Months</span>
                </div>
                <div className={`text-[11px] ${reportRange === "3-months" ? "text-slate-200" : "text-slate-500"}`}>
                  Past 90 days rolling client bookings & finances
                </div>
              </button>

              <button
                type="button"
                onClick={() => setReportRange("all")}
                className={`p-3 rounded-xl border text-left transition-all ${
                  reportRange === "all"
                    ? "bg-[#20373B] text-white border-[#20373B] shadow-xs"
                    : "bg-white text-slate-700 border-[#C3E7F1] hover:border-[#519CAB]"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Layers className={`w-4 h-4 ${reportRange === "all" ? "text-[#FFC64F]" : "text-[#519CAB]"}`} />
                  <span className="font-bold text-xs">All-Time History</span>
                </div>
                <div className={`text-[11px] ${reportRange === "all" ? "text-slate-200" : "text-slate-500"}`}>
                  Includes all past historical bookings
                </div>
              </button>

              <button
                type="button"
                onClick={() => setReportRange("month")}
                className={`p-3 rounded-xl border text-left transition-all ${
                  reportRange === "month"
                    ? "bg-[#20373B] text-white border-[#20373B] shadow-xs"
                    : "bg-white text-slate-700 border-[#C3E7F1] hover:border-[#519CAB]"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Calendar className={`w-4 h-4 ${reportRange === "month" ? "text-[#FFC64F]" : "text-[#519CAB]"}`} />
                  <span className="font-bold text-xs">Specific Month</span>
                </div>
                <div className={`text-[11px] ${reportRange === "month" ? "text-slate-200" : "text-slate-500"}`}>
                  Select a specific calendar month
                </div>
              </button>
            </div>

            {reportRange === "month" && (
              <div className="pt-2 max-w-xs space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Select Month</Label>
                <Input
                  type="month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className="bg-white border-[#C3E7F1] text-xs h-9"
                  data-testid="report-month-input"
                />
              </div>
            )}
          </div>

          {/* Section A: Comprehensive Master Reports */}
          <div className="space-y-3">
            <div className="text-xs font-bold text-[#20373B] uppercase tracking-wider">
              2. Complete Fleet & Financial Master Exports
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                onClick={() => downloadReport("pdf", "monthly")}
                disabled={downloading}
                className="group text-left p-4 border border-[#C3E7F1] rounded-2xl hover:border-[#519CAB] hover:bg-[#F4FAFC] transition-all shadow-xs disabled:opacity-50"
                data-testid="download-pdf-button"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-red-600" />
                  </div>
                  <div>
                    <div className="font-display font-bold text-[#20373B] text-sm">PDF Executive Report</div>
                    <div className="text-[11px] text-slate-400">Landscape A4 Branded Document</div>
                  </div>
                </div>
                <div className="text-xs text-slate-600 mb-3">
                  Executive KPI cards, bookings table, owner debt ledger, and agent commissions ready for printing or sharing.
                </div>
                <div className="flex items-center text-xs text-[#20373B] font-bold bg-[#C3E7F1]/40 px-3 py-2 rounded-lg group-hover:bg-[#20373B] group-hover:text-[#FFC64F] transition-all">
                  <Download className="w-4 h-4 mr-1.5" /> Download PDF ({getLabel()})
                </div>
              </button>

              <button
                onClick={() => downloadReport("xlsx", "monthly")}
                disabled={downloading}
                className="group text-left p-4 border border-[#C3E7F1] rounded-2xl hover:border-[#519CAB] hover:bg-[#F4FAFC] transition-all shadow-xs disabled:opacity-50"
                data-testid="download-xlsx-button"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center">
                    <Table2 className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <div className="font-display font-bold text-[#20373B] text-sm">Excel Master Workbook (.xlsx)</div>
                    <div className="text-[11px] text-slate-400">5 Multi-Tab Spreadsheets with Clients</div>
                  </div>
                </div>
                <div className="text-xs text-slate-600 mb-3">
                  Summary, Bookings Master, Clients CRM Directory, Owner Payables, and Agent Commissions tabs.
                </div>
                <div className="flex items-center text-xs text-[#20373B] font-bold bg-[#C3E7F1]/40 px-3 py-2 rounded-lg group-hover:bg-[#20373B] group-hover:text-[#FFC64F] transition-all">
                  <Download className="w-4 h-4 mr-1.5" /> Download Excel ({getLabel()})
                </div>
              </button>
            </div>
          </div>

          {/* Section B: Dedicated Client Directory CRM Exports */}
          <div className="space-y-3 pt-2 border-t border-[#C3E7F1]/60">
            <div className="text-xs font-bold text-[#20373B] uppercase tracking-wider flex items-center gap-1.5">
              <span>3. Dedicated Client CRM Directory Downloads</span>
              <span className="bg-[#FFC64F]/30 text-[#20373B] px-2 py-0.5 rounded text-[10px] font-semibold">CRM Specific</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                onClick={() => downloadReport("xlsx", "clients")}
                disabled={downloading}
                className="group text-left p-4 border border-emerald-200 bg-emerald-50/20 rounded-2xl hover:border-emerald-500 hover:bg-emerald-50/50 transition-all shadow-xs disabled:opacity-50"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100/60 border border-emerald-200 flex items-center justify-center">
                    <Table2 className="w-5 h-5 text-emerald-700" />
                  </div>
                  <div>
                    <div className="font-display font-bold text-[#20373B] text-sm">Clients Directory (Excel)</div>
                    <div className="text-[11px] text-emerald-700">Client CRM & Spending Analytics</div>
                  </div>
                </div>
                <div className="text-xs text-slate-600 mb-3">
                  Formatted spreadsheet of clients with phone numbers, total reservations, total spend in INR, and car preferences.
                </div>
                <div className="flex items-center text-xs text-emerald-900 font-bold bg-emerald-200/50 px-3 py-2 rounded-lg group-hover:bg-emerald-700 group-hover:text-white transition-all">
                  <Download className="w-4 h-4 mr-1.5" /> Download Clients Excel ({getLabel()})
                </div>
              </button>

              <button
                onClick={() => downloadReport("pdf", "clients")}
                disabled={downloading}
                className="group text-left p-4 border border-red-200 bg-red-50/20 rounded-2xl hover:border-red-500 hover:bg-red-50/50 transition-all shadow-xs disabled:opacity-50"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-xl bg-red-100/60 border border-red-200 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-red-700" />
                  </div>
                  <div>
                    <div className="font-display font-bold text-[#20373B] text-sm">Clients Directory (PDF)</div>
                    <div className="text-[11px] text-red-700">Client Roster & Booking Timeline</div>
                  </div>
                </div>
                <div className="text-xs text-slate-600 mb-3">
                  Landscape PDF listing all clients, contact numbers, booking counts, total revenue, and trip dates.
                </div>
                <div className="flex items-center text-xs text-red-900 font-bold bg-red-200/50 px-3 py-2 rounded-lg group-hover:bg-red-700 group-hover:text-white transition-all">
                  <Download className="w-4 h-4 mr-1.5" /> Download Clients PDF ({getLabel()})
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

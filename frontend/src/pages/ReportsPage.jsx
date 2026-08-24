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
  const [reportRange, setReportRange] = useState("all"); // "all" | "month"
  const [month, setMonth] = useState(defaultMonth);
  const [downloading, setDownloading] = useState(false);

  const downloadFile = async (kind) => {
    setDownloading(true);
    const queryParam = reportRange === "all" ? "month=all" : `month=${month}`;
    const url = `${API}/reports/monthly.${kind}?${queryParam}`;
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
      const filenameLabel = reportRange === "all" ? "complete-history" : month;
      a.download = `car-castle-goa-${filenameLabel}.${kind}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success(`${kind.toUpperCase()} report downloaded successfully!`);
    } catch (e) {
      toast.error(e.message || "Failed to download report");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <AppLayout
      title="Reports & Exports"
      subtitle="Download live synchronized branded PDF reports and multi-sheet Excel workbooks."
    >
      <div className="max-w-2xl">
        <div className="bg-white border border-[#C3E7F1] rounded-2xl p-6 shadow-xs space-y-6">
          <div>
            <div className="font-display font-bold text-xl text-[#20373B] mb-1">
              Live Fleet & Financial Export
            </div>
            <div className="text-xs text-slate-500">
              Automatically synced with live bookings database. Includes customer details, car models, plates, direct owners, cash vs online splits, security deposits, and outstanding ledgers.
            </div>
          </div>

          {/* Time Scope Selector */}
          <div className="space-y-3 bg-[#F4FAFC] p-4 rounded-xl border border-[#C3E7F1]">
            <Label className="text-xs font-bold text-[#20373B] uppercase tracking-wider block">
              1. Choose Report Scope
            </Label>
            <div className="grid grid-cols-2 gap-3">
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
                  Includes all past historical bookings + newest records
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
                  Filter report by a specific calendar month
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

          {/* Download Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              onClick={() => downloadFile("pdf")}
              disabled={downloading}
              className="group text-left p-5 border border-[#C3E7F1] rounded-2xl hover:border-[#519CAB] hover:bg-[#F4FAFC] transition-all shadow-xs disabled:opacity-50"
              data-testid="download-pdf-button"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-11 h-11 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <div className="font-display font-bold text-[#20373B] text-sm">PDF Executive Report</div>
                  <div className="text-[11px] text-slate-400">Landscape A4 Branded Document</div>
                </div>
              </div>
              <div className="text-xs text-slate-600 mb-4">
                Executive KPI summary cards, formatted bookings table, owner debt ledger, and agent commissions ready for printing or sharing.
              </div>
              <div className="flex items-center text-xs text-[#20373B] font-bold bg-[#C3E7F1]/40 px-3 py-2 rounded-lg group-hover:bg-[#20373B] group-hover:text-[#FFC64F] transition-all">
                <Download className="w-4 h-4 mr-1.5" /> Download PDF ({reportRange === "all" ? "All-Time" : month})
              </div>
            </button>

            <button
              onClick={() => downloadFile("xlsx")}
              disabled={downloading}
              className="group text-left p-5 border border-[#C3E7F1] rounded-2xl hover:border-[#519CAB] hover:bg-[#F4FAFC] transition-all shadow-xs disabled:opacity-50"
              data-testid="download-xlsx-button"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center">
                  <Table2 className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <div className="font-display font-bold text-[#20373B] text-sm">Excel Workbook (.xlsx)</div>
                  <div className="text-[11px] text-slate-400">4 Multi-Tab Master Spreadsheets</div>
                </div>
              </div>
              <div className="text-xs text-slate-600 mb-4">
                Includes Executive Summary, Bookings Master (all 27 columns with rates & dates), Owner Payables, and Agent Commissions tabs.
              </div>
              <div className="flex items-center text-xs text-[#20373B] font-bold bg-[#C3E7F1]/40 px-3 py-2 rounded-lg group-hover:bg-[#20373B] group-hover:text-[#FFC64F] transition-all">
                <Download className="w-4 h-4 mr-1.5" /> Download Excel ({reportRange === "all" ? "All-Time" : month})
              </div>
            </button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

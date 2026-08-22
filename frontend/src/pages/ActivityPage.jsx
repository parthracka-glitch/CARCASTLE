import React, { useEffect, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { api } from "@/lib/api";
import { Loader2, Edit, Trash2, PlusCircle, LogIn, LogOut, Wallet, Bell, Cog, ArrowRightLeft } from "lucide-react";

const iconFor = (a) => {
  if (a === "create") return <PlusCircle className="w-4 h-4 text-emerald-600" />;
  if (a === "update") return <Edit className="w-4 h-4 text-sky-600" />;
  if (a === "delete") return <Trash2 className="w-4 h-4 text-red-600" />;
  if (a === "login") return <LogIn className="w-4 h-4 text-[#519CAB]" />;
  if (a === "logout") return <LogOut className="w-4 h-4 text-slate-500" />;
  if (a === "payment") return <Wallet className="w-4 h-4 text-emerald-600" />;
  if (a === "reminder") return <Bell className="w-4 h-4 text-amber-600" />;
  if (a === "transfer_status" || a === "update_transfer_driver") return <ArrowRightLeft className="w-4 h-4 text-violet-600" />;
  return <Cog className="w-4 h-4 text-[#519CAB]" />;
};

export default function ActivityPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/activity", { params: { limit: 300 } });
        setRows(data);
      } catch (err) {
        console.error("Failed to load activity logs:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <AppLayout title="Activity Log">
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin text-[#519CAB]" /> Loading…
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Activity Log" subtitle="Every admin action, timestamped with before/after audit records.">
      <div className="bg-white border border-[#C3E7F1] rounded-xl overflow-hidden max-w-4xl shadow-xs">
        <ul className="divide-y divide-[#C3E7F1]/60" data-testid="activity-list">
          {rows.map((r) => {
            const detailObj = r.metadata || r.diff;
            const hasDetails = detailObj && Object.keys(detailObj).length > 0;
            return (
              <li key={r.id} className="px-5 py-3.5 flex items-start gap-3 hover:bg-[#F4FAFC] transition-colors" data-testid={`activity-row-${r.id}`}>
                <div className="mt-1 shrink-0">{iconFor(r.action)}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm">
                    <span className="font-semibold text-[#20373B]">{r.admin_email}</span>
                    <span className="text-slate-500"> {r.action.replace(/_/g, " ")} </span>
                    <span className="text-[#519CAB] font-semibold">{r.target_collection}</span>
                    {r.target_id && <span className="text-xs text-slate-400 font-mono ml-1">#{r.target_id.slice(0, 8)}</span>}
                  </div>
                  {hasDetails && (
                    <details className="mt-1.5 text-xs text-slate-500">
                      <summary className="cursor-pointer font-medium text-[#519CAB] hover:underline">View details</summary>
                      <pre className="bg-[#F4FAFC] border border-[#C3E7F1] mt-1.5 p-2.5 rounded-lg text-[11px] overflow-x-auto text-[#20373B]">
                        {JSON.stringify(detailObj, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
                <div className="text-xs text-slate-500 whitespace-nowrap font-medium">
                  {new Date(r.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </div>
              </li>
            );
          })}
          {rows.length === 0 && (
            <li className="px-5 py-12 text-center text-slate-500">No activity logged yet.</li>
          )}
        </ul>
      </div>
    </AppLayout>
  );
}

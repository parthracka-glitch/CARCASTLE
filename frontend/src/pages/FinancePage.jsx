import React, { useEffect, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { KpiCard } from "@/components/KpiCard";
import { api, formatInr } from "@/lib/api";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ComposedChart, Line,
} from "recharts";
import { Loader2, CircleDollarSign, TrendingUp, HandCoins, ShieldCheck } from "lucide-react";

export default function FinancePage() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await api.get("/finance/summary");
      setSummary(data); setLoading(false);
    })();
  }, []);

  if (loading || !summary) {
    return (
      <AppLayout title="Finance & Savings">
        <div className="flex items-center gap-2 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      </AppLayout>
    );
  }

  const s = summary;
  return (
    <AppLayout title="Finance & Savings" subtitle="Monthly income vs payouts, take-home profit, and auto-savings reserve.">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 stagger">
        <KpiCard
          icon={CircleDollarSign}
          badge="Total Sales"
          label="Customer Revenue"
          value={formatInr(s.total_income)}
          sub={`Total from ${s.booking_count} bookings`}
          testid="finance-income"
        />
        <KpiCard
          icon={HandCoins}
          badge="Costs"
          label="Total Payouts Owed"
          value={formatInr(s.total_owner_cost + s.total_agent_fee)}
          sub={`Car rent: ${formatInr(s.total_owner_cost)} · Driver fees: ${formatInr(s.total_agent_fee)}`}
          tone="negative"
          testid="finance-payouts"
        />
        <KpiCard
          icon={TrendingUp}
          badge="Your Earnings"
          label="Net Take-Home Profit"
          value={formatInr(s.total_net_profit)}
          sub={`Gross margin before drivers: ${formatInr(s.total_margin)}`}
          tone="positive"
          testid="finance-net"
        />
        <KpiCard
          icon={ShieldCheck}
          badge={`${s.savings_percent}% Reserve`}
          label="Auto Savings Fund"
          value={formatInr(s.savings_accrued)}
          sub="Auto-saved 10% from your net profit"
          tone="warn"
          testid="finance-savings"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6 sm:mt-8">
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs">
          <div className="font-display font-semibold text-slate-900">Monthly income vs payouts</div>
          <div className="text-xs text-slate-500 mb-3">Bars = flows · Line = net profit</div>
          <div className="h-64 sm:h-80">
            <ResponsiveContainer>
              <ComposedChart data={s.by_month}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#94A3B8" />
                <YAxis tick={{ fontSize: 11 }} stroke="#94A3B8" tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => formatInr(v)} contentStyle={{ fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="income" name="Income" fill="#0F172A" radius={[3, 3, 0, 0]} />
                <Bar dataKey="owner_cost" name="Owner cost" fill="#DC2626" radius={[3, 3, 0, 0]} />
                <Bar dataKey="agent_fee" name="Driver fee" fill="#F59E0B" radius={[3, 3, 0, 0]} />
                <Line type="monotone" dataKey="net_profit" name="Net profit" stroke="#EA580C" strokeWidth={2.5} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs">
          <div className="font-display font-semibold text-slate-900 mb-3">Savings accrual</div>
          <div className="h-64 sm:h-80">
            <ResponsiveContainer>
              <BarChart data={s.by_month.map((m) => ({ ...m }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="#94A3B8" />
                <YAxis tick={{ fontSize: 10 }} stroke="#94A3B8" tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => formatInr(v)} contentStyle={{ fontSize: 12 }} />
                <Bar dataKey="savings" name={`Savings @ ${s.savings_percent}%`} fill="#EA580C" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="mt-6 sm:mt-8 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <div className="px-4 sm:px-5 py-3 border-b border-slate-200 font-display font-semibold text-[#20373B]">Monthly P&L breakdown</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="text-left px-5 py-2.5 font-semibold">Month</th>
              <th className="text-right px-5 py-2.5 font-semibold">Bookings</th>
              <th className="text-right px-5 py-2.5 font-semibold">Income</th>
              <th className="text-right px-5 py-2.5 font-semibold">Owner cost</th>
              <th className="text-right px-5 py-2.5 font-semibold">Driver fee</th>
              <th className="text-right px-5 py-2.5 font-semibold">Net profit</th>
              <th className="text-right px-5 py-2.5 font-semibold">Savings</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {s.by_month.map((m) => (
              <tr key={m.month} className="dense-row">
                <td className="px-5 py-2.5 font-mono">{m.month}</td>
                <td className="px-5 py-2.5 text-right font-tabular">{m.bookings}</td>
                <td className="px-5 py-2.5 text-right font-tabular">{formatInr(m.income)}</td>
                <td className="px-5 py-2.5 text-right font-tabular text-slate-700">{formatInr(m.owner_cost)}</td>
                <td className="px-5 py-2.5 text-right font-tabular text-slate-700">{formatInr(m.agent_fee)}</td>
                <td className="px-5 py-2.5 text-right font-tabular font-semibold text-emerald-700">{formatInr(m.net_profit)}</td>
                <td className="px-5 py-2.5 text-right font-tabular font-bold text-[#519CAB]">{formatInr(m.savings)}</td>
              </tr>
            ))}
            {s.by_month.length === 0 && (
              <tr><td colSpan={7} className="px-5 py-12 text-center text-slate-500">No booking data yet.</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </AppLayout>
  );
}

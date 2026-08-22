import React, { useEffect, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { KpiCard } from "@/components/KpiCard";
import StatusPill from "@/components/StatusPill";
import { api, formatInr, formatDate } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, CircleDollarSign, TrendingUp, Clock, ShieldCheck } from "lucide-react";

export default function DashboardPage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [series, setSeries] = useState([]);
  const [gran, setGran] = useState("day");
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);

  const isOperator = user?.role === "operator";

  useEffect(() => {
    (async () => {
      try {
        if (!isOperator) {
          const [s, r] = await Promise.all([
            api.get("/finance/summary").catch(() => ({ data: null })),
            api.get("/bookings", { params: { } }).catch(() => ({ data: [] })),
          ]);
          if (s?.data && typeof s.data === "object") setSummary(s.data);
          if (Array.isArray(r?.data)) setRecent(r.data.slice(0, 8));
        } else {
          const r = await api.get("/bookings").catch(() => ({ data: [] }));
          if (Array.isArray(r?.data)) setRecent(r.data.slice(0, 12));
        }
      } catch (err) {
        console.error("Dashboard load error:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [isOperator]);

  useEffect(() => {
    if (isOperator) return;
    (async () => {
      try {
        const { data } = await api.get("/finance/margin-timeseries", {
          params: { granularity: gran },
        });
        if (Array.isArray(data)) setSeries(data);
      } catch (err) {
        console.error("Series load error:", err);
      }
    })();
  }, [gran, isOperator]);

  if (loading) {
    return (
      <AppLayout title="Dashboard">
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      </AppLayout>
    );
  }

  if (isOperator) {
    return (
      <AppLayout
        title={`Namaste, ${user.name}`}
        subtitle="Recent bookings and airport transfers assigned to your desk."
      >
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 stagger">
          <div className="bg-white border border-slate-200 rounded-lg p-5 animate-fade-up">
            <div className="text-[11px] uppercase tracking-widest text-slate-500 font-semibold">
              Active Bookings
            </div>
            <div className="mt-2 font-display text-3xl font-bold tracking-tight text-slate-900 font-tabular">
              {recent.filter((b) => ["reserved", "car_received", "with_customer"].includes(b.status)).length}
            </div>
            <div className="text-xs text-slate-500 mt-1">In-flight rentals</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-5 animate-fade-up">
            <div className="text-[11px] uppercase tracking-widest text-slate-500 font-semibold">
              Airport Transfers
            </div>
            <div className="mt-2 font-display text-3xl font-bold tracking-tight text-slate-900 font-tabular">
              {recent.filter((b) => b.transfer_type && b.transfer_type !== "none").length}
            </div>
            <div className="text-xs text-slate-500 mt-1">Includes pickup + drop</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-5 animate-fade-up">
            <div className="text-[11px] uppercase tracking-widest text-slate-500 font-semibold">
              Today
            </div>
            <div className="mt-2 font-display text-3xl font-bold tracking-tight text-slate-900 font-tabular">
              {formatDate(new Date().toISOString())}
            </div>
          </div>
        </div>

        <div className="mt-8 bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
            <div className="font-display font-semibold">Recent bookings</div>
          </div>
          <RecentTable rows={recent} isOperator />
        </div>
      </AppLayout>
    );
  }

  const s = summary || {};
  return (
    <AppLayout title="Dashboard" subtitle="Overview of customer sales, net earnings, owner dues, and savings.">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 stagger">
        <KpiCard
          icon={CircleDollarSign}
          badge="Total Sales"
          label="Customer Revenue"
          value={formatInr(s.total_income)}
          sub={`Total collected from customers across ${s.booking_count || 0} bookings`}
          tone="default"
          testid="kpi-customer-revenue"
        />
        <KpiCard
          icon={TrendingUp}
          badge="Your Earnings"
          label="Net Profit (Take-Home)"
          value={formatInr(s.total_net_profit)}
          sub="What you keep after paying car rent & driver fees"
          tone="positive"
          testid="kpi-net-profit"
        />
        <KpiCard
          icon={Clock}
          badge="Unpaid Balance"
          label="Pending to Car Owners"
          value={formatInr(s.owner_pending)}
          sub="Car rental payout balance you still need to pay"
          tone="negative"
          testid="kpi-owner-payables"
        />
        <KpiCard
          icon={ShieldCheck}
          badge={`${s.savings_percent || 10}% Saved`}
          label="Auto Savings Reserve"
          value={formatInr(s.savings_accrued)}
          sub={`Auto-saved from profit · Driver pending: ${formatInr(s.agent_pending)}`}
          tone="warn"
          testid="kpi-savings"
        />
      </div>

      {/* Money Flow Visual Breakdown */}
      <div className="mt-4 p-4 bg-white border border-[#C3E7F1] rounded-xl shadow-xs flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 font-bold text-[#20373B] shrink-0">
          <div className="w-6 h-6 rounded-md bg-[#FFC64F]/30 text-[#20373B] flex items-center justify-center font-bold">
            ₹
          </div>
          <span>Money Flow Summary:</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-slate-600 text-xs">
          <span className="bg-[#F4FAFC] border border-[#C3E7F1] px-2.5 py-1 rounded-md">
            Customer Revenue: <strong className="text-[#20373B] font-tabular">{formatInr(s.total_income)}</strong>
          </span>
          <span className="text-[#519CAB] font-bold">−</span>
          <span className="bg-red-50 text-red-800 border border-red-200 px-2.5 py-1 rounded-md">
            Car Rent (Cost): <strong className="font-tabular">{formatInr(s.total_owner_cost)}</strong>
          </span>
          <span className="text-[#519CAB] font-bold">−</span>
          <span className="bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-1 rounded-md">
            Driver Fees: <strong className="font-tabular">{formatInr(s.total_agent_fee)}</strong>
          </span>
          <span className="text-[#519CAB] font-bold">=</span>
          <span className="bg-emerald-50 text-emerald-800 font-bold px-2.5 py-1 rounded-md border border-emerald-200">
            Your Net Profit: <strong className="font-tabular">{formatInr(s.total_net_profit)}</strong>
          </span>
        </div>
      </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">
        <div className="lg:col-span-2 bg-white border border-[#C3E7F1] rounded-xl p-5 shadow-xs" data-testid="margin-chart-card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="font-display font-bold text-[#20373B] text-lg">Margin trend</div>
              <div className="text-xs text-[#519CAB] font-medium">Customer rate − owner cost, over time</div>
            </div>
            <Select value={gran} onValueChange={setGran}>
              <SelectTrigger className="w-36 h-9 border-[#C3E7F1] text-[#20373B]" data-testid="margin-granularity-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">By day</SelectItem>
                <SelectItem value="week">By week</SelectItem>
                <SelectItem value="month">By month</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="h-72">
            <ResponsiveContainer>
              <LineChart data={series}>
                <CartesianGrid strokeDasharray="3 3" stroke="#C3E7F1" vertical={false} />
                <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: "#20373B" }} stroke="#519CAB" />
                <YAxis tick={{ fontSize: 11, fill: "#20373B" }} stroke="#519CAB"
                  tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => formatInr(v)} contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: "#C3E7F1" }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="margin" name="Margin"
                  stroke="#519CAB" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="net_profit" name="Net profit"
                  stroke="#20373B" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white border border-[#C3E7F1] rounded-xl p-5 shadow-xs" data-testid="monthly-pnl-card">
          <div className="font-display font-bold text-[#20373B] text-lg">Monthly P&L</div>
          <div className="text-xs text-[#519CAB] font-medium mb-3">Income vs payouts vs net</div>
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={(s.by_month || []).slice(-6)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#C3E7F1" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#20373B" }} stroke="#519CAB" />
                <YAxis tick={{ fontSize: 10, fill: "#20373B" }} stroke="#519CAB"
                  tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => formatInr(v)} contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: "#C3E7F1" }} />
                <Bar dataKey="income" name="Income" fill="#20373B" radius={[4, 4, 0, 0]} />
                <Bar dataKey="net_profit" name="Net" fill="#FFC64F" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="mt-8 bg-white border border-[#C3E7F1] rounded-xl overflow-hidden shadow-xs">
        <div className="px-5 py-4 border-b border-[#C3E7F1] bg-[#F4FAFC]">
          <div className="font-display font-bold text-[#20373B]">Recent bookings</div>
        </div>
        <RecentTable rows={recent} />
      </div>
    </AppLayout>
  );
}

function RecentTable({ rows, isOperator }) {
  if (!rows || rows.length === 0) {
    return <div className="p-8 text-center text-sm text-slate-500">No bookings yet.</div>;
  }
  return (
    <table className="w-full text-sm" data-testid="recent-bookings-table">
      <thead className="bg-[#F4FAFC] text-[11px] uppercase tracking-wider text-[#20373B]/70 border-b border-[#C3E7F1]">
        <tr>
          <th className="text-left px-5 py-3 font-bold">Start</th>
          <th className="text-left px-5 py-3 font-bold">Customer</th>
          <th className="text-left px-5 py-3 font-bold">Car</th>
          <th className="text-left px-5 py-3 font-bold">Status</th>
          {!isOperator && <th className="text-right px-5 py-3 font-bold">Cost</th>}
          <th className="text-right px-5 py-3 font-bold">Rate</th>
          {!isOperator && <th className="text-right px-5 py-3 font-bold">Margin</th>}
        </tr>
      </thead>
      <tbody className="divide-y divide-[#C3E7F1]/50">
        {rows.map((b) => (
          <tr key={b.id} className="dense-row hover:bg-[#C3E7F1]/20 transition-colors">
            <td className="px-5 py-3 text-slate-700">{formatDate(b.start_date)}</td>
            <td className="px-5 py-3 font-semibold text-[#20373B]">{b.customer_name}</td>
            <td className="px-5 py-3 text-slate-600">
              {b.car_model} <span className="text-[#519CAB] font-mono text-xs ml-1">{b.car_registration}</span>
            </td>
            <td className="px-5 py-3"><StatusPill status={b.status} /></td>
            {!isOperator && <td className="px-5 py-3 text-right font-tabular text-slate-700">{formatInr(b.cost_rate)}</td>}
            <td className="px-5 py-3 text-right font-tabular font-bold text-[#20373B]">{formatInr(b.customer_rate)}</td>
            {!isOperator && <td className="px-5 py-3 text-right font-tabular text-[#519CAB] font-bold">{formatInr(b.margin)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

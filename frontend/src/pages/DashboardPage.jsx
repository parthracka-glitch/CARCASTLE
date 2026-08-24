import React, { useEffect, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { KpiCard } from "@/components/KpiCard";
import StatusPill from "@/components/StatusPill";
import { api, formatInr, formatDate, formatApiError } from "@/lib/api";
import { formatTime12h } from "@/lib/dateUtils";
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
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Loader2, CircleDollarSign, TrendingUp, Clock, ShieldCheck,
  Calendar, Bell, BellRing, Plane, Banknote, CreditCard, RefreshCw, UserCheck
} from "lucide-react";

export default function DashboardPage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [series, setSeries] = useState([]);
  const [gran, setGran] = useState("day");
  const [recent, setRecent] = useState([]);
  const [schedule, setSchedule] = useState({ today: [], tomorrow: [], upcoming: [] });
  const [loading, setLoading] = useState(true);
  const [remindingId, setRemindingId] = useState(null);

  const isOperator = user?.role === "operator";

  const loadData = async () => {
    try {
      if (!isOperator) {
        const [s, r, sch] = await Promise.all([
          api.get("/finance/summary").catch(() => ({ data: null })),
          api.get("/bookings", { params: {} }).catch(() => ({ data: [] })),
          api.get("/transfers/schedule").catch(() => ({ data: { today: [], tomorrow: [], upcoming: [] } })),
        ]);
        if (s?.data && typeof s.data === "object") setSummary(s.data);
        if (Array.isArray(r?.data)) setRecent(r.data.slice(0, 10));
        if (sch?.data) setSchedule(sch.data);
      } else {
        const [r, sch] = await Promise.all([
          api.get("/bookings").catch(() => ({ data: [] })),
          api.get("/transfers/schedule").catch(() => ({ data: { today: [], tomorrow: [], upcoming: [] } })),
        ]);
        if (Array.isArray(r?.data)) setRecent(r.data.slice(0, 12));
        if (sch?.data) setSchedule(sch.data);
      }
    } catch (err) {
      console.error("Dashboard load error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [isOperator]); // eslint-disable-line

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

  const sendDriverReminder = async (bookingId, driverName) => {
    setRemindingId(bookingId);
    try {
      const { data } = await api.post(`/transfers/${bookingId}/remind-driver`);
      toast.success(data.message || `Schedule reminder sent to ${driverName}`);
      await loadData();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed to dispatch reminder");
    } finally {
      setRemindingId(null);
    }
  };

  const refundDeposit = async (b) => {
    if (!window.confirm(`Refund security deposit of ₹${Number(b.deposit_amount || 0).toLocaleString('en-IN')} to ${b.customer_name}?`)) return;
    try {
      await api.put(`/bookings/${b.id}/refund-deposit`, {});
      toast.success(`Deposit of ${formatInr(b.deposit_amount)} refunded to ${b.customer_name}`);
      await loadData();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed to refund deposit");
    }
  };

  if (loading) {
    return (
      <AppLayout title="Dashboard">
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin text-[#519CAB]" /> Loading dashboard…
        </div>
      </AppLayout>
    );
  }

  const tomorrowTransfers = schedule.tomorrow || [];

  if (isOperator) {
    return (
      <AppLayout
        title={`Namaste, ${user.name}`}
        subtitle="Driver schedules, next-day pickups & drops, and assigned fleet bookings."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 stagger">
          <div className="bg-white border border-[#C3E7F1] rounded-xl p-5 shadow-xs">
            <div className="text-[11px] uppercase tracking-widest text-slate-500 font-semibold">
              Active Bookings
            </div>
            <div className="mt-2 font-display text-3xl font-bold tracking-tight text-[#20373B] font-tabular">
              {recent.filter((b) => ["reserved", "car_received", "with_customer"].includes(b.status)).length}
            </div>
            <div className="text-xs text-slate-500 mt-1">In-flight rentals</div>
          </div>
          <div className="bg-white border border-[#C3E7F1] rounded-xl p-5 shadow-xs">
            <div className="text-[11px] uppercase tracking-widest text-slate-500 font-semibold">
              Airport Transfers
            </div>
            <div className="mt-2 font-display text-3xl font-bold tracking-tight text-[#20373B] font-tabular">
              {recent.filter((b) => b.transfer_type && b.transfer_type !== "none").length}
            </div>
            <div className="text-xs text-slate-500 mt-1">Includes pickup + drop</div>
          </div>
          <div className="bg-white border border-[#C3E7F1] rounded-xl p-5 shadow-xs">
            <div className="text-[11px] uppercase tracking-widest text-[#519CAB] font-semibold">
              Tomorrow's Transfers
            </div>
            <div className="mt-2 font-display text-3xl font-bold tracking-tight text-[#519CAB] font-tabular">
              {tomorrowTransfers.length}
            </div>
            <div className="text-xs text-slate-500 mt-1">Pickups & Drops scheduled</div>
          </div>
          <div className="bg-white border border-[#C3E7F1] rounded-xl p-5 shadow-xs">
            <div className="text-[11px] uppercase tracking-widest text-slate-500 font-semibold">
              Today
            </div>
            <div className="mt-2 font-display text-2xl font-bold tracking-tight text-[#20373B] font-tabular">
              {formatDate(new Date().toISOString())}
            </div>
          </div>
        </div>

        {/* 🚗 Driver & Operator Next-Day Schedule Section */}
        <div className="mt-6 bg-white border border-[#C3E7F1] rounded-xl p-5 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-[#C3E7F1]">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[#20373B] text-[#FFC64F] flex items-center justify-center font-bold">
                <Calendar className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-display font-bold text-[#20373B] text-base">Tomorrow's Pickups, Drops & Driver Alerts</h3>
                <p className="text-xs text-[#519CAB] font-medium">Scheduled for {schedule.tomorrow_date ? formatDate(schedule.tomorrow_date) : "Tomorrow"}</p>
              </div>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full bg-[#F4FAFC] border border-[#C3E7F1] font-semibold text-[#20373B]">
              {tomorrowTransfers.length} Action{tomorrowTransfers.length === 1 ? "" : "s"}
            </span>
          </div>

          {tomorrowTransfers.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              🌴 No airport transfers or pickups scheduled for tomorrow. All clear!
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {tomorrowTransfers.map((b) => (
                <div key={b.id} className="p-4 rounded-xl bg-[#F4FAFC] border border-[#C3E7F1] space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-bold text-[#20373B] text-sm">{b.customer_name}</div>
                      <a href={`tel:${b.customer_contact}`} className="text-xs text-[#519CAB] font-semibold">
                        📞 {b.customer_contact}
                      </a>
                    </div>
                    <span className="px-2 py-0.5 rounded-md bg-white border border-[#C3E7F1] text-[11px] font-mono font-bold text-[#20373B]">
                      {b.car_registration} ({b.car_model})
                    </span>
                  </div>

                  <div className="text-xs text-slate-600 bg-white p-2 rounded-lg border border-[#C3E7F1]/60 flex items-center justify-between">
                    <span>
                      <strong>Driver:</strong> {b.driver_name || "Owner (Self)"}
                    </span>
                    <span className="text-[11px] text-[#519CAB] font-semibold font-tabular">
                      Time: {b.flight_time || formatTime12h(b.pickup_time)}
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-500">
                    📍 <strong>Point:</strong> {b.transfer_pickup_point || b.pickup_location}
                  </div>

                  <div className="pt-1 flex items-center justify-end">
                    <Button
                      size="sm"
                      onClick={() => sendDriverReminder(b.id, b.driver_name || "Driver")}
                      disabled={remindingId === b.id}
                      className="bg-[#20373B] hover:bg-[#2C494E] text-[#FFC64F] font-bold text-xs h-8 shadow-xs"
                    >
                      {remindingId === b.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin mr-1 text-[#FFC64F]" />
                      ) : (
                        <Bell className="w-3.5 h-3.5 mr-1 text-[#FFC64F]" />
                      )}
                      Notify Driver
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-8 bg-white border border-[#C3E7F1] rounded-xl overflow-hidden shadow-xs">
          <div className="px-5 py-4 border-b border-[#C3E7F1] bg-[#F4FAFC]">
            <div className="font-display font-bold text-[#20373B]">Recent bookings</div>
          </div>
          <RecentTable rows={recent} isOperator onRefundDeposit={refundDeposit} />
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

      {/* 💵 Payment Method Breakdown & Security Deposits Strip */}
      <div className="mt-4 p-4 bg-white border border-[#C3E7F1] rounded-xl shadow-xs flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 font-bold text-[#20373B] shrink-0">
          <div className="w-6 h-6 rounded-md bg-[#FFC64F]/30 text-[#20373B] flex items-center justify-center font-bold">
            💳
          </div>
          <span>Collections Breakdown:</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-slate-600 text-xs">
          <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-1 rounded-md font-medium flex items-center gap-1">
            <Banknote className="w-3.5 h-3.5 text-emerald-600" />
            Cash Sales: <strong className="font-tabular text-emerald-900">{formatInr(s.total_cash_income)}</strong>
          </span>
          <span className="bg-blue-50 text-blue-800 border border-blue-200 px-2.5 py-1 rounded-md font-medium flex items-center gap-1">
            <CreditCard className="w-3.5 h-3.5 text-blue-600" />
            Online (UPI/Bank): <strong className="font-tabular text-blue-900">{formatInr(s.total_online_income)}</strong>
          </span>
          <span className="bg-amber-50 text-amber-900 border border-amber-200 px-2.5 py-1 rounded-md font-medium flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-amber-700" />
            Active Deposits Held: <strong className="font-tabular">{formatInr(s.total_deposit_held)}</strong>
          </span>
          {Number(s.total_deposit_refunded || 0) > 0 && (
            <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-md text-[11px]">
              Refunded Deposits: <strong className="font-tabular">{formatInr(s.total_deposit_refunded)}</strong>
            </span>
          )}
        </div>
      </div>

      {/* 📅 Tomorrow's Driver Schedule & Alert Dispatcher */}
      <div className="mt-6 bg-white border border-[#C3E7F1] rounded-xl p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-[#C3E7F1]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#20373B] text-[#FFC64F] flex items-center justify-center font-bold shadow-xs">
              <Plane className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-display font-bold text-[#20373B] text-base">Tomorrow's Pickups, Drops & Driver Alerts</h3>
              <p className="text-xs text-[#519CAB] font-medium">Schedule for {schedule.tomorrow_date ? formatDate(schedule.tomorrow_date) : "Tomorrow"}</p>
            </div>
          </div>
          <span className="text-xs px-2.5 py-1 rounded-full bg-[#F4FAFC] border border-[#C3E7F1] font-semibold text-[#20373B] self-start sm:self-auto">
            {tomorrowTransfers.length} Scheduled
          </span>
        </div>

        {tomorrowTransfers.length === 0 ? (
          <div className="p-6 text-center text-slate-400 text-xs bg-[#F4FAFC] rounded-xl border border-dashed border-[#C3E7F1]">
            🌴 No airport transfers or pickups scheduled for tomorrow. All vehicles and drivers assigned smoothly!
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {tomorrowTransfers.map((b) => (
              <div key={b.id} className="p-3.5 rounded-xl bg-[#F4FAFC] border border-[#C3E7F1] space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-bold text-[#20373B] text-sm">{b.customer_name}</div>
                    <a href={`tel:${b.customer_contact}`} className="text-xs text-[#519CAB] font-semibold">
                      📞 {b.customer_contact}
                    </a>
                  </div>
                  <span className="px-2 py-0.5 rounded-md bg-white border border-[#C3E7F1] text-[11px] font-mono font-bold text-[#20373B]">
                    {b.car_registration}
                  </span>
                </div>

                <div className="text-xs text-slate-600 bg-white p-2 rounded-lg border border-[#C3E7F1]/60 flex items-center justify-between">
                  <span>
                    <strong>Driver:</strong> {b.driver_name || "Owner (Self)"}
                  </span>
                  <span className="text-[11px] text-[#519CAB] font-semibold font-tabular">
                    Time: {b.flight_time || formatTime12h(b.pickup_time)}
                  </span>
                </div>

                <div className="text-[11px] text-slate-500 truncate">
                  📍 {b.transfer_pickup_point || b.pickup_location || "Airport / Hotel"}
                </div>

                <div className="pt-1 flex items-center justify-end">
                  <Button
                    size="sm"
                    onClick={() => sendDriverReminder(b.id, b.driver_name || "Driver")}
                    disabled={remindingId === b.id}
                    className="bg-[#20373B] hover:bg-[#2C494E] text-[#FFC64F] font-bold text-xs h-7 shadow-xs"
                  >
                    {remindingId === b.id ? (
                      <Loader2 className="w-3 h-3 animate-spin mr-1 text-[#FFC64F]" />
                    ) : (
                      <Bell className="w-3 h-3 mr-1 text-[#FFC64F]" />
                    )}
                    Send Alert
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Margin Trend & Monthly P&L */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
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
        <RecentTable rows={recent} onRefundDeposit={refundDeposit} />
      </div>
    </AppLayout>
  );
}

function RecentTable({ rows, isOperator, onRefundDeposit }) {
  if (!rows || rows.length === 0) {
    return <div className="p-8 text-center text-sm text-slate-500">No bookings yet.</div>;
  }
  return (
    <>
      {/* 📱 Mobile Cards View (<sm) */}
      <div className="block sm:hidden divide-y divide-[#C3E7F1]/60">
        {rows.map((b) => {
          const isCash = (b.payment_method || "cash") === "cash";
          const depAmt = Number(b.deposit_amount || 0);

          return (
            <div key={b.id} className="p-3.5 space-y-2 bg-white">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-bold text-[#20373B] text-sm">{b.customer_name}</div>
                  <div className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                    <span>{b.car_model || "Standard Vehicle"}</span>
                    {!b.car_registration || b.car_registration === "TBD" || b.car_registration === "—" ? (
                      <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1 py-0.2 rounded border border-amber-200">
                        ⚠️ Plate TBD
                      </span>
                    ) : (
                      <span className="font-mono text-[#519CAB]">{b.car_registration}</span>
                    )}
                  </div>
                </div>
                <StatusPill status={b.status} />
              </div>

              {/* Badges strip */}
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                  isCash ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-blue-50 text-blue-800 border border-blue-200"
                }`}>
                  {isCash ? "💵 Cash" : "💳 Online"}
                </span>
                {depAmt > 0 && (
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                    b.deposit_status === "refunded" ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-amber-50 text-amber-900 border border-amber-200"
                  }`}>
                    🛡️ Dep: {formatInr(depAmt)} ({b.deposit_status === "refunded" ? "Refunded" : "Held"})
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
                <span className="text-slate-500">{formatDate(b.start_date)}</span>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 font-tabular font-medium">Rate: {formatInr(b.customer_rate)}</span>
                  {!isOperator && (
                    <span className="font-bold text-emerald-700 font-tabular">Net: {formatInr(b.margin)}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 💻 Desktop Table View (hidden sm:block) */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm" data-testid="recent-bookings-table">
          <thead className="bg-[#F4FAFC] text-[11px] uppercase tracking-wider text-[#20373B]/70 border-b border-[#C3E7F1]">
            <tr>
              <th className="text-left px-5 py-3 font-bold">Start</th>
              <th className="text-left px-5 py-3 font-bold">Customer</th>
              <th className="text-left px-5 py-3 font-bold">Car & Plate</th>
              <th className="text-left px-5 py-3 font-bold">Payment</th>
              <th className="text-left px-5 py-3 font-bold">Deposit</th>
              <th className="text-left px-5 py-3 font-bold">Status</th>
              {!isOperator && <th className="text-right px-5 py-3 font-bold">Cost</th>}
              <th className="text-right px-5 py-3 font-bold">Rate</th>
              {!isOperator && <th className="text-right px-5 py-3 font-bold">Margin</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#C3E7F1]/40">
            {rows.map((b) => {
              const isCash = (b.payment_method || "cash") === "cash";
              const depAmt = Number(b.deposit_amount || 0);

              return (
                <tr key={b.id} className="dense-row hover:bg-[#C3E7F1]/20 transition-colors">
                  <td className="px-5 py-3 text-slate-700">{formatDate(b.start_date)}</td>
                  <td className="px-5 py-3 font-semibold text-[#20373B]">{b.customer_name}</td>
                  <td className="px-5 py-3 text-slate-600">
                    <span>{b.car_model || "Standard"}</span>
                    {!b.car_registration || b.car_registration === "TBD" || b.car_registration === "—" ? (
                      <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200 ml-1.5">
                        ⚠️ Plate TBD
                      </span>
                    ) : (
                      <span className="text-[#519CAB] font-mono text-xs ml-1.5">{b.car_registration}</span>
                    )}
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                      isCash ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-blue-50 text-blue-800 border border-blue-200"
                    }`}>
                      {isCash ? <Banknote className="w-3 h-3 text-emerald-600" /> : <CreditCard className="w-3 h-3 text-blue-600" />}
                      {isCash ? "Cash" : "Online"}
                    </span>
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    {depAmt > 0 ? (
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-xs font-tabular text-[#20373B]">{formatInr(depAmt)}</span>
                        <span className={`text-[10px] font-bold uppercase px-1.5 py-0.2 rounded ${
                          b.deposit_status === "refunded" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                        }`}>
                          {b.deposit_status === "refunded" ? "Refunded" : "Held"}
                        </span>
                        {b.deposit_status === "received" && onRefundDeposit && (
                          <button
                            type="button"
                            onClick={() => onRefundDeposit(b)}
                            className="text-[10px] font-bold text-emerald-700 hover:text-emerald-900 underline"
                          >
                            Refund
                          </button>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3"><StatusPill status={b.status} /></td>
                  {!isOperator && <td className="px-5 py-3 text-right font-tabular text-slate-700">{formatInr(b.cost_rate)}</td>}
                  <td className="px-5 py-3 text-right font-tabular font-bold text-[#20373B]">{formatInr(b.customer_rate)}</td>
                  {!isOperator && <td className="px-5 py-3 text-right font-tabular text-[#519CAB] font-bold">{formatInr(b.margin)}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}


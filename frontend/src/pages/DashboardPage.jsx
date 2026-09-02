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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Loader2, CircleDollarSign, TrendingUp, Clock, ShieldCheck,
  Calendar, Bell, BellRing, Plane, Banknote, CreditCard, RefreshCw, UserCheck,
  Plus, Trash2, Fuel, Wrench, Sparkles, Tag, AlertTriangle, Receipt, Car
} from "lucide-react";

const expenseCatMeta = {
  fuel: { label: "Fuel", icon: "⛽", badge: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  fastag: { label: "FASTag / Toll", icon: "🏷️", badge: "bg-blue-50 text-blue-800 border-blue-200" },
  driver_payment: { label: "Driver Extra", icon: "🚕", badge: "bg-amber-50 text-amber-800 border-amber-200" },
  service: { label: "Service / Repair", icon: "🔧", badge: "bg-purple-50 text-purple-800 border-purple-200" },
  wash: { label: "Car Wash", icon: "🧼", badge: "bg-cyan-50 text-cyan-800 border-cyan-200" },
  challan: { label: "Traffic Challan", icon: "⚠️", badge: "bg-red-50 text-red-800 border-red-200" },
  other: { label: "Other Expense", icon: "📝", badge: "bg-slate-100 text-slate-800 border-slate-200" },
};

export default function DashboardPage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [series, setSeries] = useState([]);
  const [gran, setGran] = useState("day");
  const [recent, setRecent] = useState([]);
  const [schedule, setSchedule] = useState({ today: [], tomorrow: [], upcoming: [] });
  const [loading, setLoading] = useState(true);
  const [remindingId, setRemindingId] = useState(null);

  // Owner Expenses State
  const [expensesList, setExpensesList] = useState([]);
  const [expensesSummary, setExpensesSummary] = useState({
    total_expenses: 0,
    fuel_total: 0,
    fastag_total: 0,
    driver_payment_total: 0,
    service_total: 0,
    wash_total: 0,
    challan_total: 0,
    other_total: 0,
  });
  const [carsList, setCarsList] = useState([]);
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [expenseFilterCat, setExpenseFilterCat] = useState("all");
  const [savingExpense, setSavingExpense] = useState(false);
  const [expenseForm, setExpenseForm] = useState({
    category: "fuel",
    amount: "",
    date: new Date().toISOString().slice(0, 10),
    car_id: "none",
    payment_method: "cash",
    description: "",
    driver_name: "",
  });

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

  const loadExpenses = async () => {
    try {
      const [{ data: expData }, { data: sumData }, { data: cData }] = await Promise.all([
        api.get("/expenses", { params: { limit: 100 } }).catch(() => ({ data: [] })),
        api.get("/expenses/summary").catch(() => ({ data: {} })),
        api.get("/cars").catch(() => ({ data: [] })),
      ]);
      if (Array.isArray(expData)) setExpensesList(expData);
      if (sumData) setExpensesSummary((prev) => ({ ...prev, ...sumData }));
      if (Array.isArray(cData)) setCarsList(cData);
    } catch (e) {
      console.error("Expenses load error:", e);
    }
  };

  useEffect(() => {
    loadData();
    loadExpenses();
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

  const handleSaveExpense = async () => {
    if (!expenseForm.amount || Number(expenseForm.amount) <= 0) {
      toast.error("Please enter a valid expense amount");
      return;
    }
    setSavingExpense(true);
    try {
      await api.post("/expenses", {
        category: expenseForm.category,
        amount: Number(expenseForm.amount),
        date: expenseForm.date || new Date().toISOString().slice(0, 10),
        car_id: expenseForm.car_id !== "none" ? expenseForm.car_id : null,
        payment_method: expenseForm.payment_method,
        description: expenseForm.description,
        driver_name: expenseForm.driver_name,
      });
      toast.success("Expense recorded successfully");
      setExpenseModalOpen(false);
      setExpenseForm({
        category: "fuel",
        amount: "",
        date: new Date().toISOString().slice(0, 10),
        car_id: "none",
        payment_method: "cash",
        description: "",
        driver_name: "",
      });
      await loadExpenses();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Failed to record expense");
    } finally {
      setSavingExpense(false);
    }
  };

  const handleDeleteExpense = async (id) => {
    if (!window.confirm("Delete this expense record?")) return;
    try {
      await api.delete(`/expenses/${id}`);
      toast.success("Expense deleted");
      await loadExpenses();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Failed to delete expense");
    }
  };

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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4 stagger">
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4 stagger">
        <KpiCard
          icon={CircleDollarSign}
          badge="Total Sales"
          label="Customer Revenue"
          value={formatInr(s.total_income)}
          sub={s.total_transfer_income > 0 ? `Car: ${formatInr(s.total_car_income || 0)} + Airport: ${formatInr(s.total_transfer_income || 0)}` : `Total collected from customers across ${s.booking_count || 0} bookings`}
          tone="default"
          testid="kpi-customer-revenue"
        />
        <KpiCard
          icon={TrendingUp}
          badge="Your Earnings"
          label="Net Profit (Take-Home)"
          value={formatInr(s.total_net_profit)}
          sub={s.total_transfer_profit > 0 ? `Car profit: ${formatInr(s.total_car_profit || 0)} + Cab pickup profit: ${formatInr(s.total_transfer_profit || 0)}` : "What you keep after paying car rent & driver fees"}
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

      {/* 📊 Live Net Profit Formula Card */}
      <div className="mt-3 p-3.5 bg-emerald-50/80 border border-emerald-200 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-2.5 text-xs text-emerald-950 shadow-2xs">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold shrink-0 text-sm shadow-xs">
            ₹
          </div>
          <div>
            <div className="font-bold text-xs text-emerald-950">
              Net Profit Formula Breakdown:
            </div>
            <div className="text-[11px] text-emerald-800">
              (Total Booking + Airport Transfer) − Car Owner Rent − Driver Cut = <strong>Net Take-Home Profit</strong>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs font-semibold">
          <span className="bg-white border border-emerald-300 px-2.5 py-1 rounded-md text-emerald-900 shadow-2xs">
            🚗 Car Profit: <strong className="font-tabular text-[#20373B]">{formatInr(s.total_car_profit !== undefined ? s.total_car_profit : (s.total_income - (s.total_owner_cost || 0)))}</strong>
          </span>
          <span className="text-emerald-700 font-bold">+</span>
          <span className="bg-white border border-emerald-300 px-2.5 py-1 rounded-md text-emerald-900 shadow-2xs">
            ✈️ Cab Pickup Profit: <strong className="font-tabular text-[#20373B]">{formatInr(s.total_transfer_profit || 0)}</strong>
          </span>
          <span className="text-emerald-700 font-bold">=</span>
          <span className="bg-emerald-600 text-white px-2.5 py-1 rounded-md font-bold shadow-2xs">
            {formatInr(s.total_net_profit)} Net Take-Home
          </span>
        </div>
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

      {/* 🧾 Owner Out-of-Pocket Expenses Section */}
      <div className="mt-6 bg-white border border-[#C3E7F1] rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#C3E7F1]">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-[#20373B] text-[#FFC64F] flex items-center justify-center font-bold text-lg shadow-xs">
              🧾
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-display font-bold text-[#20373B] text-base sm:text-lg">
                  Owner Personal & Business Expenses
                </h3>
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-[#F4FAFC] border border-[#C3E7F1] text-[#20373B] font-tabular">
                  {formatInr(expensesSummary.total_expenses)} Total
                </span>
              </div>
              <p className="text-xs text-[#519CAB] font-medium mt-0.5">
                Record petrol/fuel, FASTags, extra driver duty cash, servicing, washes & repairs
              </p>
            </div>
          </div>

          <Button
            onClick={() => setExpenseModalOpen(true)}
            className="bg-[#20373B] hover:bg-[#2C494E] text-[#FFC64F] font-bold text-xs h-8 sm:h-9 px-3.5 shadow-xs self-start sm:self-auto"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Record Expense
          </Button>
        </div>

        {/* 6 Category Summary Quick Filter Pills */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-2.5">
          <div
            onClick={() => setExpenseFilterCat("all")}
            className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
              expenseFilterCat === "all"
                ? "bg-[#20373B] text-white border-[#20373B] shadow-xs"
                : "bg-[#F4FAFC] border-[#C3E7F1] hover:border-[#519CAB] text-slate-700"
            }`}
          >
            <div className="text-[10px] uppercase tracking-wider font-semibold opacity-80">All Expenses</div>
            <div className={`font-bold font-tabular text-sm mt-0.5 ${expenseFilterCat === "all" ? "text-[#FFC64F]" : "text-[#20373B]"}`}>
              {formatInr(expensesSummary.total_expenses)}
            </div>
          </div>

          <div
            onClick={() => setExpenseFilterCat("fuel")}
            className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
              expenseFilterCat === "fuel"
                ? "bg-emerald-800 text-white border-emerald-800 shadow-xs"
                : "bg-emerald-50/60 border-emerald-200 hover:border-emerald-400 text-emerald-900"
            }`}
          >
            <div className="text-[10px] uppercase tracking-wider font-semibold opacity-80 flex items-center gap-1">
              <span>⛽</span> Fuel
            </div>
            <div className={`font-bold font-tabular text-sm mt-0.5 ${expenseFilterCat === "fuel" ? "text-emerald-200" : "text-emerald-800"}`}>
              {formatInr(expensesSummary.fuel_total)}
            </div>
          </div>

          <div
            onClick={() => setExpenseFilterCat("fastag")}
            className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
              expenseFilterCat === "fastag"
                ? "bg-blue-800 text-white border-blue-800 shadow-xs"
                : "bg-blue-50/60 border-blue-200 hover:border-blue-400 text-blue-900"
            }`}
          >
            <div className="text-[10px] uppercase tracking-wider font-semibold opacity-80 flex items-center gap-1">
              <span>🏷️</span> FASTag
            </div>
            <div className={`font-bold font-tabular text-sm mt-0.5 ${expenseFilterCat === "fastag" ? "text-blue-200" : "text-blue-800"}`}>
              {formatInr(expensesSummary.fastag_total)}
            </div>
          </div>

          <div
            onClick={() => setExpenseFilterCat("driver_payment")}
            className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
              expenseFilterCat === "driver_payment"
                ? "bg-amber-800 text-white border-amber-800 shadow-xs"
                : "bg-amber-50/60 border-amber-200 hover:border-amber-400 text-amber-900"
            }`}
          >
            <div className="text-[10px] uppercase tracking-wider font-semibold opacity-80 flex items-center gap-1">
              <span>🚕</span> Driver Cash
            </div>
            <div className={`font-bold font-tabular text-sm mt-0.5 ${expenseFilterCat === "driver_payment" ? "text-amber-200" : "text-amber-800"}`}>
              {formatInr(expensesSummary.driver_payment_total)}
            </div>
          </div>

          <div
            onClick={() => setExpenseFilterCat("service")}
            className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
              expenseFilterCat === "service"
                ? "bg-purple-800 text-white border-purple-800 shadow-xs"
                : "bg-purple-50/60 border-purple-200 hover:border-purple-400 text-purple-900"
            }`}
          >
            <div className="text-[10px] uppercase tracking-wider font-semibold opacity-80 flex items-center gap-1">
              <span>🔧</span> Service
            </div>
            <div className={`font-bold font-tabular text-sm mt-0.5 ${expenseFilterCat === "service" ? "text-purple-200" : "text-purple-800"}`}>
              {formatInr(expensesSummary.service_total)}
            </div>
          </div>

          <div
            onClick={() => setExpenseFilterCat("wash")}
            className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
              expenseFilterCat === "wash"
                ? "bg-cyan-800 text-white border-cyan-800 shadow-xs"
                : "bg-cyan-50/60 border-cyan-200 hover:border-cyan-400 text-cyan-900"
            }`}
          >
            <div className="text-[10px] uppercase tracking-wider font-semibold opacity-80 flex items-center gap-1">
              <span>🧼</span> Washes
            </div>
            <div className={`font-bold font-tabular text-sm mt-0.5 ${expenseFilterCat === "wash" ? "text-cyan-200" : "text-cyan-800"}`}>
              {formatInr(expensesSummary.wash_total)}
            </div>
          </div>
        </div>

        {/* Expenses List */}
        {(() => {
          const filtered = expensesList.filter((e) =>
            expenseFilterCat === "all" ? true : e.category === expenseFilterCat
          );

          if (filtered.length === 0) {
            return (
              <div className="p-8 text-center text-slate-400 text-xs bg-[#F4FAFC] rounded-xl border border-dashed border-[#C3E7F1] space-y-2">
                <div className="text-2xl">🧾</div>
                <div className="font-semibold text-slate-600">
                  {expenseFilterCat === "all"
                    ? "No expenses logged yet."
                    : `No expenses logged under ${expenseCatMeta[expenseFilterCat]?.label || expenseFilterCat}.`}
                </div>
                <p className="text-[11px] text-slate-400">
                  Click "+ Record Expense" to log personal fuel, FASTags, extra driver cash, or car repairs.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setExpenseForm((prev) => ({
                      ...prev,
                      category: expenseFilterCat !== "all" ? expenseFilterCat : "fuel",
                    }));
                    setExpenseModalOpen(true);
                  }}
                  className="text-xs text-[#519CAB] border-[#C3E7F1] hover:bg-white"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> Log Expense
                </Button>
              </div>
            );
          }

          return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filtered.slice(0, 12).map((exp) => {
                const meta = expenseCatMeta[exp.category] || expenseCatMeta.other;
                const isCash = exp.payment_method === "cash";

                return (
                  <div
                    key={exp.id}
                    className="p-3.5 rounded-xl bg-[#F4FAFC] border border-[#C3E7F1] hover:border-[#519CAB] transition-all flex flex-col justify-between space-y-2 shadow-2xs"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <span
                          className={`text-[11px] px-2 py-0.5 rounded-md font-bold uppercase border flex items-center gap-1 ${meta.badge}`}
                        >
                          <span>{meta.icon}</span>
                          <span>{meta.label}</span>
                        </span>

                        <div className="text-right">
                          <span className="font-display font-extrabold text-sm text-[#20373B] font-tabular">
                            {formatInr(exp.amount)}
                          </span>
                        </div>
                      </div>

                      {/* Vehicle / Driver attribution */}
                      {(exp.car_registration || exp.car_model || exp.driver_name) && (
                        <div className="text-[11px] text-slate-600 flex items-center gap-1.5 flex-wrap">
                          {exp.car_registration && (
                            <span className="font-mono font-bold text-[#20373B] bg-white border border-[#C3E7F1] px-1.5 py-0.2 rounded text-[10px]">
                              {exp.car_registration}
                            </span>
                          )}
                          {exp.car_model && (
                            <span className="text-slate-500 font-medium truncate max-w-[120px]">
                              {exp.car_model}
                            </span>
                          )}
                          {exp.driver_name && (
                            <span className="text-amber-800 bg-amber-50 px-1.5 py-0.2 rounded text-[10px] font-semibold border border-amber-200">
                              Driver: {exp.driver_name}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Note description */}
                      {exp.description && (
                        <p className="text-xs text-slate-700 bg-white p-2 rounded-lg border border-[#C3E7F1]/60 line-clamp-2">
                          {exp.description}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 text-[11px] text-slate-400">
                      <div className="flex items-center gap-1.5">
                        <span>{formatDate(exp.date)}</span>
                        <span>·</span>
                        <span className="font-medium text-slate-600">
                          {isCash ? "💵 Cash" : "💳 Online UPI"}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteExpense(exp.id)}
                        className="text-slate-400 hover:text-red-600 p-1 rounded transition-colors"
                        title="Delete expense"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
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

      {/* 📝 Record Expense Dialog Modal */}
      <Dialog open={expenseModalOpen} onOpenChange={setExpenseModalOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="font-display text-[#20373B] text-lg flex items-center gap-2">
              <span>🧾</span> Record Owner Out-of-Pocket Expense
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3.5 py-2">
            <div>
              <Label className="text-xs font-bold text-[#20373B]">Expense Category</Label>
              <Select
                value={expenseForm.category}
                onValueChange={(v) => setExpenseForm((p) => ({ ...p, category: v }))}
              >
                <SelectTrigger className="mt-1 border-[#C3E7F1] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fuel">⛽ Fuel (Petrol / Diesel)</SelectItem>
                  <SelectItem value="fastag">🏷️ FASTag / Toll Recharge</SelectItem>
                  <SelectItem value="driver_payment">🚕 Driver Extra / Spot Payment</SelectItem>
                  <SelectItem value="service">🔧 Service / Repair / Maintenance</SelectItem>
                  <SelectItem value="wash">🧼 Car Wash & Cleaning</SelectItem>
                  <SelectItem value="challan">⚠️ Traffic Challan / Fine</SelectItem>
                  <SelectItem value="other">📝 Other Business Expense</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold text-[#20373B]">Amount (₹) *</Label>
                <Input
                  type="number"
                  placeholder="e.g. 1500"
                  value={expenseForm.amount}
                  onChange={(e) => setExpenseForm((p) => ({ ...p, amount: e.target.value }))}
                  className="mt-1 border-[#C3E7F1] text-xs font-tabular font-bold"
                />
              </div>

              <div>
                <Label className="text-xs font-bold text-[#20373B]">Date</Label>
                <Input
                  type="date"
                  value={expenseForm.date}
                  onChange={(e) => setExpenseForm((p) => ({ ...p, date: e.target.value }))}
                  className="mt-1 border-[#C3E7F1] text-xs font-tabular"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs font-bold text-[#20373B]">Linked Vehicle (Optional)</Label>
              <Select
                value={expenseForm.car_id}
                onValueChange={(v) => setExpenseForm((p) => ({ ...p, car_id: v }))}
              >
                <SelectTrigger className="mt-1 border-[#C3E7F1] text-xs">
                  <SelectValue placeholder="General / Unspecified Vehicle" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">General / Unspecified Vehicle</SelectItem>
                  {carsList.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      🚗 {c.model} ({c.registration_no})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {expenseForm.category === "driver_payment" && (
              <div>
                <Label className="text-xs font-bold text-[#20373B]">Driver Name</Label>
                <Input
                  placeholder="e.g. Manoj, Ramesh"
                  value={expenseForm.driver_name}
                  onChange={(e) => setExpenseForm((p) => ({ ...p, driver_name: e.target.value }))}
                  className="mt-1 border-[#C3E7F1] text-xs"
                />
              </div>
            )}

            <div>
              <Label className="text-xs font-bold text-[#20373B]">Payment Method</Label>
              <Select
                value={expenseForm.payment_method}
                onValueChange={(v) => setExpenseForm((p) => ({ ...p, payment_method: v }))}
              >
                <SelectTrigger className="mt-1 border-[#C3E7F1] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">💵 Cash Out-of-Pocket</SelectItem>
                  <SelectItem value="online">💳 Online (UPI / GPay / Bank)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs font-bold text-[#20373B]">Description / Note</Label>
              <Textarea
                placeholder="e.g. Full tank petrol before airport trip, FASTag recharge on highway..."
                value={expenseForm.description}
                onChange={(e) => setExpenseForm((p) => ({ ...p, description: e.target.value }))}
                className="mt-1 border-[#C3E7F1] text-xs min-h-[65px]"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExpenseModalOpen(false)}
              className="text-xs border-[#C3E7F1]"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSaveExpense}
              disabled={savingExpense}
              className="bg-[#20373B] hover:bg-[#2C494E] text-[#FFC64F] font-bold text-xs"
            >
              {savingExpense ? <Loader2 className="w-3 h-3 animate-spin mr-1 text-[#FFC64F]" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
              Save Expense
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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


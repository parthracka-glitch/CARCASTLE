import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import StatusPill from "@/components/StatusPill";
import { api, formatInr, formatDate, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Bell, IndianRupee, Loader2, User, Phone, CheckCircle2, Trash2,
  Fuel, Droplets, Plus, MessageSquare, Copy, ExternalLink, Check,
  Wrench, AlertTriangle, FileText, Calendar, RotateCcw
} from "lucide-react";

export default function EntityLedgerPage({ type }) {
  const isOwner = type === "owner";
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canWrite = user?.role === "super_admin";

  const [entity, setEntity] = useState(null);
  const [entries, setEntries] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("payouts"); // 'payouts' | 'expenses'

  // Month filter (e.g. "all" or "2026-08")
  const [selectedMonth, setSelectedMonth] = useState("all");

  // Payment dialog
  const [payOpen, setPayOpen] = useState(false);
  const [payEntry, setPayEntry] = useState(null);
  const [payAmt, setPayAmt] = useState("");
  const [payNote, setPayNote] = useState("");

  // Delete entity dialog
  const [delOpen, setDelOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Handover Expense dialog
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [expenseForm, setExpenseForm] = useState({
    category: "fuel",
    amount: "",
    car_id: "none",
    description: "",
    settlement_type: "deduct_from_payout",
  });
  const [savingExpense, setSavingExpense] = useState(false);

  // Monthly Retainer / Lease dialog
  const [monthlyRentModalOpen, setMonthlyRentModalOpen] = useState(false);
  const [monthlyRentForm, setMonthlyRentForm] = useState({
    car_id: "",
    month: new Date().toISOString().slice(0, 7),
    amount: "",
    notes: "",
  });
  const [postingMonthlyRent, setPostingMonthlyRent] = useState(false);

  // WhatsApp statement dialog
  const [whatsAppModalOpen, setWhatsAppModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const getMonthOptions = () => {
    const options = [];
    const now = new Date();
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
      options.push({ value, label: i === 0 ? `${label} (Current)` : label });
    }
    return options;
  };
  const monthOptions = getMonthOptions();

  const load = async () => {
    try {
      if (isOwner) {
        const expParams = selectedMonth !== "all" ? { month: selectedMonth } : {};
        const sumParams = selectedMonth !== "all" ? { month: selectedMonth } : {};

        const [e, l, exp, sum] = await Promise.all([
          api.get(`/owners/${id}`),
          api.get("/ledger", { params: { entity_type: type, entity_id: id } }),
          api.get(`/owners/${id}/expenses`, { params: expParams }),
          api.get(`/owners/${id}/settlement-summary`, { params: sumParams }),
        ]);
        setEntity(e.data);
        setEntries(l.data);
        setExpenses(exp.data);
        setSummary(sum.data);
        if (e.data.cars?.length === 1 && (!expenseForm.car_id || expenseForm.car_id === "none")) {
          setExpenseForm((prev) => ({ ...prev, car_id: e.data.cars[0].id }));
        }
      } else {
        const [e, l] = await Promise.all([
          api.get(`/agents/${id}`),
          api.get("/ledger", { params: { entity_type: type, entity_id: id } }),
        ]);
        setEntity(e.data);
        setEntries(l.data);
      }
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Failed to load statement");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id, selectedMonth]); // eslint-disable-line

  const deleteEntity = async () => {
    setDeleting(true);
    try {
      await api.delete(`/${isOwner ? "owners" : "agents"}/${id}`);
      toast.success(`${isOwner ? "Car Owner" : "Car Driver"} deleted successfully`);
      navigate(isOwner ? "/owners" : "/agents");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed to delete");
      setDeleting(false);
    }
  };

  const openPay = (e) => {
    setPayEntry(e);
    setPayAmt(String(Number(e.amount) - Number(e.amount_paid)));
    setPayNote("");
    setPayOpen(true);
  };

  const submitPay = async () => {
    try {
      await api.post(`/ledger/${payEntry.id}/pay`, {
        amount_paid: Number(payAmt), note: payNote,
      });
      toast.success("Payment recorded");
      setPayOpen(false);
      await load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  };

  const remind = async (e) => {
    try {
      const { data } = await api.post(`/ledger/${e.id}/remind`);
      toast.success("Reminder sent (mock)", { description: data.message });
      await load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  // Add Expense
  const handleSaveExpense = async () => {
    if (!expenseForm.amount || Number(expenseForm.amount) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    setSavingExpense(true);
    try {
      await api.post(`/owners/${id}/expenses`, {
        owner_id: id,
        car_id: (expenseForm.car_id && expenseForm.car_id !== "none") ? expenseForm.car_id : null,
        category: expenseForm.category,
        amount: Number(expenseForm.amount),
        description: expenseForm.description,
        settlement_type: expenseForm.settlement_type,
      });
      toast.success("Handover charge / expense recorded");
      setExpenseModalOpen(false);
      setExpenseForm({
        category: "fuel",
        amount: "",
        car_id: entity?.cars?.length === 1 ? entity.cars[0].id : "none",
        description: "",
        settlement_type: "deduct_from_payout",
      });
      await load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed to save expense");
    } finally {
      setSavingExpense(false);
    }
  };

  // Settle Expense
  const handleSettleExpense = async (exp, isSettled) => {
    try {
      await api.put(`/owners/expenses/${exp.id}/settle`, {
        is_settled: isSettled,
        settlement_type: exp.settlement_type,
        note: isSettled ? "Settled directly" : "",
      });
      toast.success(isSettled ? "Marked as settled" : "Marked as pending");
      await load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed to update status");
    }
  };

  // Delete Expense
  const handleDeleteExpense = async (expenseId) => {
    if (!window.confirm("Delete this expense record?")) return;
    try {
      await api.delete(`/owners/expenses/${expenseId}`);
      toast.success("Expense record deleted");
      await load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed to delete");
    }
  };

  // Monthly Retainer Open & Post
  const monthlyCars = (entity?.cars || []).filter((c) => c.billing_type === "monthly");

  const openPostMonthlyRentModal = () => {
    const firstCar = monthlyCars[0] || entity?.cars?.[0];
    const currMonth = selectedMonth !== "all" ? selectedMonth : new Date().toISOString().slice(0, 7);
    setMonthlyRentForm({
      car_id: firstCar?.id || "",
      month: currMonth,
      amount: String(firstCar?.monthly_cost_rate || ""),
      notes: "Fixed monthly retainer",
    });
    setMonthlyRentModalOpen(true);
  };

  const handlePostMonthlyRent = async () => {
    if (!monthlyRentForm.car_id) {
      toast.error("Please select a vehicle");
      return;
    }
    if (!monthlyRentForm.amount || Number(monthlyRentForm.amount) <= 0) {
      toast.error("Please enter a valid monthly rent amount");
      return;
    }
    setPostingMonthlyRent(true);
    try {
      await api.post(`/owners/${id}/post-monthly-rent`, {
        car_id: monthlyRentForm.car_id,
        month: monthlyRentForm.month,
        amount: Number(monthlyRentForm.amount),
        notes: monthlyRentForm.notes,
      });
      toast.success(`Monthly rent for ${monthlyRentForm.month} posted to statement!`);
      setMonthlyRentModalOpen(false);
      await load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed to post monthly rent");
    } finally {
      setPostingMonthlyRent(false);
    }
  };

  // Build WhatsApp Statement Text
  const buildWhatsAppText = () => {
    if (!entity) return "";
    const isMonthlyView = selectedMonth !== "all";
    const monthLabel = isMonthlyView
      ? new Date(`${selectedMonth}-01`).toLocaleDateString("en-IN", { month: "long", year: "numeric" })
      : "";
    const today = new Date().toLocaleDateString("en-IN", {
      day: "numeric", month: "short", year: "numeric",
    });

    const carsList = entity.cars?.map((c) => {
      const typeStr = c.billing_type === "monthly" ? ` [Monthly Lease: ${formatInr(c.monthly_cost_rate)}/mo]` : "";
      return `🚗 ${c.model} (${c.registration_no})${typeStr}`;
    }).join("\n") || "🚗 Vehicle on fleet";

    const totalOwedAmt = summary ? summary.total_owed : Number(entity.total_owed);
    const totalPaidAmt = summary ? summary.total_paid : Number(entity.total_paid);
    const unsettledExp = summary ? summary.unsettled_expenses : 0;
    const netDue = summary ? summary.net_balance_due : (totalOwedAmt - totalPaidAmt);

    let text = isMonthlyView
      ? `🌴 *CAR CASTLE GOA — MONTHLY SETTLEMENT STATEMENT*\n`
      : `🌴 *CAR CASTLE GOA — OWNER SETTLEMENT STATEMENT*\n`;

    if (isMonthlyView) {
      text += `📅 *Billing Month:* ${monthLabel}\n`;
      text += `🗓️ Statement Generated: ${today}\n`;
    } else {
      text += `📅 Date: ${today}\n`;
    }
    text += `👤 Car Owner: ${entity.name}\n`;
    text += `📞 Contact: ${entity.contact || "—"}\n\n`;
    text += `*Assigned Vehicles:*\n${carsList}\n\n`;

    text += isMonthlyView
      ? `💰 *Monthly Retainers & Rental Earnings (${monthLabel}):*\n`
      : `💰 *Rental Earnings (Gross Payout):*\n`;
    text += `• Total Retainers & Earnings: ${formatInr(totalOwedAmt)}\n\n`;

    if (unsettledExp > 0 && summary?.unsettled_items?.length) {
      text += isMonthlyView
        ? `⛽ *Handover Charges & Deductions for ${monthLabel}:*\n`
        : `⛽ *Handover Charges & Deductions Paid by Us:*\n`;
      summary.unsettled_items.forEach((item) => {
        const catIcon = item.category === "fuel" ? "⛽ Fuel" : item.category === "wash" ? "🧼 Wash" : "🔧 Charge";
        const carStr = item.car_registration ? ` (${item.car_registration})` : "";
        const dateStr = item.date ? ` [${new Date(item.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}]` : "";
        text += `• ${catIcon}${carStr}${dateStr}: -${formatInr(item.amount)} ${item.description ? `(${item.description})` : ""}\n`;
      });
      text += `• *Total Deductions:* -${formatInr(unsettledExp)}\n\n`;
    }

    text += `📊 *${isMonthlyView ? `${monthLabel} Settlement Breakdown` : "Settlement Summary"}:*\n`;
    text += `• Gross Rental / Retainer: ${formatInr(totalOwedAmt)}\n`;
    if (unsettledExp > 0) {
      text += `• Less Deductions: -${formatInr(unsettledExp)}\n`;
      text += `• Net Payout Amount: ${formatInr(totalOwedAmt - unsettledExp)}\n`;
    }
    text += isMonthlyView
      ? `• Advance Payments Paid in Month: ${formatInr(totalPaidAmt)}\n`
      : `• Amount Paid to Date: ${formatInr(totalPaidAmt)}\n`;
    text += `------------------------------------\n`;
    text += `*${isMonthlyView ? `Remaining Month-End Due: ` : `Pending Balance Due: `}${formatInr(netDue)}*\n\n`;
    text += `Thank you for partnering with Car Castle Goa! For any queries or settlement updates, please contact us. 🚗✨`;
    return text;
  };

  const copyWhatsApp = () => {
    const text = buildWhatsAppText();
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Statement copied to clipboard!");
    setTimeout(() => setCopied(false), 2500);
  };

  const openWhatsApp = () => {
    const text = buildWhatsAppText();
    const cleanPhone = (entity?.contact || "").replace(/[^0-9]/g, "");
    const phoneParam = cleanPhone ? (cleanPhone.startsWith("91") ? cleanPhone : `91${cleanPhone}`) : "";
    const url = phoneParam
      ? `https://wa.me/${phoneParam}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  };

  const getCategoryBadge = (cat) => {
    switch (cat) {
      case "fuel":
        return <span className="inline-flex items-center gap-1 text-[10px] sm:text-xs font-semibold px-1.5 sm:px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 shrink-0"><Fuel className="w-3 h-3 text-amber-600" /> Fuel</span>;
      case "wash":
        return <span className="inline-flex items-center gap-1 text-[10px] sm:text-xs font-semibold px-1.5 sm:px-2 py-0.5 rounded-md bg-cyan-50 text-cyan-800 border border-cyan-200 shrink-0"><Droplets className="w-3 h-3 text-cyan-600" /> Wash</span>;
      case "maintenance":
        return <span className="inline-flex items-center gap-1 text-[10px] sm:text-xs font-semibold px-1.5 sm:px-2 py-0.5 rounded-md bg-purple-50 text-purple-800 border border-purple-200 shrink-0"><Wrench className="w-3 h-3 text-purple-600" /> Repair</span>;
      case "challan":
        return <span className="inline-flex items-center gap-1 text-[10px] sm:text-xs font-semibold px-1.5 sm:px-2 py-0.5 rounded-md bg-red-50 text-red-800 border border-red-200 shrink-0"><AlertTriangle className="w-3 h-3 text-red-600" /> Fine</span>;
      default:
        return <span className="inline-flex items-center gap-1 text-[10px] sm:text-xs font-semibold px-1.5 sm:px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 shrink-0"><FileText className="w-3 h-3 text-slate-500" /> Other</span>;
    }
  };

  if (loading || !entity) {
    return (
      <AppLayout title="Payout Statement">
        <div className="flex items-center gap-2 text-slate-500"><Loader2 className="w-4 h-4 animate-spin text-[#519CAB]" /> Loading…</div>
      </AppLayout>
    );
  }

  const totalOwedAmt = summary ? summary.total_owed : Number(entity.total_owed);
  const totalPaidAmt = summary ? summary.total_paid : Number(entity.total_paid);
  const unsettledExpAmt = summary ? summary.unsettled_expenses : 0;
  const netDueAmt = summary ? summary.net_balance_due : Math.max(0, totalOwedAmt - totalPaidAmt);

  // Filter entries if month is selected
  const displayedEntries = selectedMonth === "all"
    ? entries
    : entries.filter((ent) => (ent.created_at || ent.due_date || "").startsWith(selectedMonth));

  const isMonthlyFilterActive = selectedMonth !== "all";

  return (
    <AppLayout
      title={entity.name}
      subtitle={isOwner ? "Car owner payout statement, handover charges & monthly dues" : "Car driver payout statement & dues"}
      actions={
        <div className="flex items-center flex-wrap gap-1.5 sm:gap-2">
          {canWrite && isOwner && (
            <>
              {(monthlyCars.length > 0 || entity.cars?.length > 0) && (
                <Button
                  variant="outline"
                  onClick={openPostMonthlyRentModal}
                  className="border-purple-300 text-purple-800 hover:bg-purple-50 text-[11px] sm:text-xs font-bold h-8 sm:h-9 px-2 sm:px-3 shadow-xs"
                >
                  <Calendar className="w-3.5 h-3.5 mr-1 text-purple-600 shrink-0" />
                  <span className="hidden sm:inline">Post Monthly Rent</span>
                  <span className="sm:hidden">Post Rent</span>
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => setWhatsAppModalOpen(true)}
                className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 text-[11px] sm:text-xs font-bold h-8 sm:h-9 px-2 sm:px-3 shadow-xs"
                data-testid="whatsapp-statement-button"
              >
                <MessageSquare className="w-3.5 h-3.5 mr-1 text-emerald-600 shrink-0" />
                <span className="hidden sm:inline">{isMonthlyFilterActive ? "Monthly WhatsApp" : "WhatsApp Statement"}</span>
                <span className="sm:hidden">WhatsApp</span>
              </Button>
              <Button
                onClick={() => setExpenseModalOpen(true)}
                className="bg-[#20373B] hover:bg-[#2C494E] text-[#FFC64F] font-bold text-[11px] sm:text-xs h-8 sm:h-9 px-2 sm:px-3 shadow-xs"
                data-testid="add-handover-charge-button"
              >
                <Plus className="w-3.5 h-3.5 mr-1 shrink-0" />
                <span className="hidden sm:inline">Add Fuel / Wash Charge</span>
                <span className="sm:hidden">+ Charge</span>
              </Button>
            </>
          )}
          {canWrite && (
            <Button
              variant="outline"
              onClick={() => setDelOpen(true)}
              className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 font-semibold text-[11px] sm:text-xs h-8 sm:h-9 px-2 sm:px-3 shadow-xs cursor-pointer"
              data-testid="delete-entity-header-button"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1 text-red-500 shrink-0" />
              <span className="hidden sm:inline">Delete {isOwner ? "Owner" : "Driver"}</span>
              <span className="sm:hidden">Delete</span>
            </Button>
          )}
        </div>
      }
    >
      {/* Month Filter Selector Bar (Car Owners) */}
      {isOwner && (
        <div className="bg-white border border-[#C3E7F1] rounded-xl p-3 sm:p-4 mb-4 sm:mb-6 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center flex-wrap gap-2 sm:gap-2.5 w-full sm:w-auto">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-[#C3E7F1]/30 border border-[#C3E7F1] flex items-center justify-center text-[#20373B] shrink-0">
              <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
            <div className="min-w-0 flex-1 sm:flex-initial">
              <div className="text-[10px] sm:text-[11px] uppercase tracking-wider text-slate-500 font-bold">Settlement Period</div>
              <div className="text-xs font-semibold text-[#20373B] truncate">Billing cycle filter:</div>
            </div>
            <div className="w-full sm:w-auto sm:min-w-[200px]">
              <Select value={selectedMonth} onValueChange={(v) => setSelectedMonth(v)}>
                <SelectTrigger className="h-8 text-xs font-semibold bg-[#F4FAFC] border-[#C3E7F1] w-full">
                  <SelectValue placeholder="Select period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">🌐 All Time (Cumulative Total)</SelectItem>
                  {monthOptions.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      📅 {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {isMonthlyFilterActive && (
            <div className="flex items-center justify-between w-full sm:w-auto gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#C3E7F1]/40">
              <span className="text-[10px] sm:text-[11px] font-semibold text-purple-900 bg-purple-50 border border-purple-200 px-2 sm:px-2.5 py-1 rounded-md truncate">
                Viewing <strong>{monthOptions.find((m) => m.value === selectedMonth)?.label || selectedMonth}</strong>
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedMonth("all")}
                className="h-7 text-xs text-slate-500 hover:text-[#20373B] shrink-0"
              >
                <RotateCcw className="w-3 h-3 mr-1" /> Reset
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Profile & Summary Metric Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 mb-4 sm:mb-6">
        <div className="bg-white border border-[#C3E7F1] rounded-xl p-4 sm:p-6 lg:col-span-1 shadow-xs">
          <div className="flex items-center gap-3 sm:block">
            <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-full bg-[#C3E7F1]/30 border border-[#C3E7F1] flex items-center justify-center shrink-0">
              <User className="w-5 h-5 sm:w-7 sm:h-7 text-[#20373B]" />
            </div>
            <div>
              <div className="font-display text-base sm:text-xl font-bold text-[#20373B] leading-tight">{entity.name}</div>
              <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                <Phone className="w-3 h-3" />{entity.contact || "No contact"}
              </div>
            </div>
          </div>

          {isOwner && entity.cars && (
            <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-[#C3E7F1]/60">
              <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-1.5">Cars supplied ({entity.cars.length})</div>
              {entity.cars.length === 0 && <div className="text-xs text-slate-400">None registered yet</div>}
              <div className="space-y-1">
                {entity.cars.map((c) => (
                  <div key={c.id} className="text-xs py-0.5 flex justify-between items-center">
                    <div className="truncate mr-2">
                      <span className="font-medium text-[#20373B]">{c.model}</span>
                      {c.billing_type === "monthly" && (
                        <span className="ml-1 text-[9px] font-bold px-1 rounded bg-purple-50 text-purple-800 border border-purple-200">
                          Mo
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-mono text-[#519CAB] shrink-0">{c.registration_no}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 4 Metric Cards Grid: Clean 2x2 grid on mobile (<sm) and 4 cols on desktop */}
        {isOwner ? (
          <div className="lg:col-span-2 grid grid-cols-2 xl:grid-cols-4 gap-2.5 sm:gap-4">
            <div className="bg-white border border-[#C3E7F1] rounded-xl p-3 sm:p-4 shadow-xs">
              <div className="text-[10px] sm:text-[11px] uppercase tracking-wider text-[#20373B]/70 font-bold truncate">
                {isMonthlyFilterActive ? "Earnings" : "Rental Earnings"}
              </div>
              <div className="font-display text-lg sm:text-xl font-extrabold text-[#20373B] mt-1 sm:mt-2 font-tabular truncate">
                {formatInr(totalOwedAmt)}
              </div>
              <div className="text-[9px] sm:text-[10px] text-slate-400 mt-0.5 truncate">
                {isMonthlyFilterActive ? "Month retainers + bookings" : "Gross bookings & leases"}
              </div>
            </div>

            <div className={`bg-white border rounded-xl p-3 sm:p-4 shadow-xs ${unsettledExpAmt > 0 ? "border-amber-300 bg-amber-50/20" : "border-[#C3E7F1]"}`}>
              <div className="text-[10px] sm:text-[11px] uppercase tracking-wider text-amber-800 font-bold flex items-center gap-1 truncate">
                <Fuel className="w-3 h-3 text-amber-600 shrink-0" /> Fuel & Washes
              </div>
              <div className="font-display text-lg sm:text-xl font-extrabold text-amber-900 mt-1 sm:mt-2 font-tabular truncate">
                -{formatInr(unsettledExpAmt)}
              </div>
              <div className="text-[9px] sm:text-[10px] text-amber-700 mt-0.5 truncate">
                Paid by us (to deduct)
              </div>
            </div>

            <div className="bg-white border border-[#C3E7F1] rounded-xl p-3 sm:p-4 shadow-xs">
              <div className="text-[10px] sm:text-[11px] uppercase tracking-wider text-[#20373B]/70 font-bold truncate">
                {isMonthlyFilterActive ? "Month Advances" : "Lifetime Paid"}
              </div>
              <div className="font-display text-lg sm:text-xl font-extrabold text-emerald-600 mt-1 sm:mt-2 font-tabular truncate">
                {formatInr(totalPaidAmt)}
              </div>
              <div className="text-[9px] sm:text-[10px] text-slate-400 mt-0.5 truncate">
                Settled payments
              </div>
            </div>

            <div className={`bg-white border rounded-xl p-3 sm:p-4 shadow-xs ${netDueAmt > 0 ? "border-red-300 bg-red-50/20" : "border-[#C3E7F1]"}`}>
              <div className="text-[10px] sm:text-[11px] uppercase tracking-wider font-bold text-red-800 truncate">
                {isMonthlyFilterActive ? "Month-End Due" : "Net Pending Due"}
              </div>
              <div className={`font-display text-lg sm:text-xl font-extrabold mt-1 sm:mt-2 font-tabular truncate ${netDueAmt > 0 ? "text-red-700" : "text-slate-500"}`}>
                {formatInr(netDueAmt)}
              </div>
              <div className="text-[9px] sm:text-[10px] text-slate-500 mt-0.5 truncate">
                After fuel/wash deduction
              </div>
            </div>
          </div>
        ) : (
          <div className="lg:col-span-2 grid grid-cols-3 gap-2.5 sm:gap-4">
            <div className="bg-white border border-[#C3E7F1] rounded-xl p-3 sm:p-5 shadow-xs">
              <div className="text-[10px] sm:text-[11px] uppercase tracking-wider text-[#20373B]/70 font-bold">Owed</div>
              <div className="font-display text-base sm:text-2xl font-extrabold text-[#20373B] mt-1 sm:mt-2 font-tabular">{formatInr(totalOwedAmt)}</div>
            </div>
            <div className="bg-white border border-[#C3E7F1] rounded-xl p-3 sm:p-5 shadow-xs">
              <div className="text-[10px] sm:text-[11px] uppercase tracking-wider text-[#20373B]/70 font-bold">Paid</div>
              <div className="font-display text-base sm:text-2xl font-extrabold text-emerald-600 mt-1 sm:mt-2 font-tabular">{formatInr(totalPaidAmt)}</div>
            </div>
            <div className="bg-white border border-[#C3E7F1] rounded-xl p-3 sm:p-5 shadow-xs">
              <div className="text-[10px] sm:text-[11px] uppercase tracking-wider text-[#20373B]/70 font-bold">Due</div>
              <div className={`font-display text-base sm:text-2xl font-extrabold mt-1 sm:mt-2 font-tabular ${netDueAmt > 0 ? "text-red-700" : "text-slate-500"}`}>
                {formatInr(netDueAmt)}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tabs navigation for Car Owners */}
      {isOwner && (
        <div className="flex items-center gap-1.5 sm:gap-2 mb-4 border-b border-[#C3E7F1] pb-2 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveTab("payouts")}
            className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${
              activeTab === "payouts"
                ? "bg-[#20373B] text-[#FFC64F] shadow-sm"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            <span>Payout History & Dues</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/20">{displayedEntries.length}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("expenses")}
            className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${
              activeTab === "expenses"
                ? "bg-[#20373B] text-[#FFC64F] shadow-sm"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            <Fuel className="w-3.5 h-3.5 text-amber-500" />
            <span>Fuel & Washes</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${unsettledExpAmt > 0 ? "bg-amber-400 text-amber-950 font-bold" : "bg-black/20"}`}>
              {expenses.length}
            </span>
          </button>
        </div>
      )}

      {/* Tab 1: Payout History & Dues */}
      {(!isOwner || activeTab === "payouts") && (
        <div className="bg-white border border-[#C3E7F1] rounded-xl overflow-hidden shadow-xs">
          <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-[#C3E7F1] bg-[#F4FAFC] flex items-center justify-between">
            <div className="font-display font-bold text-[#20373B] text-sm sm:text-base">
              Payout History & Dues {isMonthlyFilterActive && `(${selectedMonth})`}
            </div>
            <div className="text-xs text-[#519CAB] font-semibold">{displayedEntries.length} records</div>
          </div>

          {/* Mobile Payout Cards (<sm) */}
          <div className="block sm:hidden divide-y divide-[#C3E7F1]/60">
            {displayedEntries.map((e) => {
              const bal = Math.max(0, Number(e.amount) - Number(e.amount_paid));
              return (
                <div key={e.id} className="p-3.5 space-y-2 bg-white" data-testid={`ledger-card-${e.id}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-[#20373B] text-sm leading-snug">{e.description}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">{formatDate(e.created_at)}</div>
                    </div>
                    <StatusPill status={e.status} />
                  </div>

                  <div className="grid grid-cols-3 gap-1.5 text-center p-2 rounded-lg bg-[#F4FAFC] border border-[#C3E7F1]/60 text-xs">
                    <div>
                      <div className="text-[9px] uppercase tracking-wider text-slate-400">Total Owed</div>
                      <div className="font-bold font-tabular text-[#20373B]">{formatInr(e.amount)}</div>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase tracking-wider text-slate-400">Paid</div>
                      <div className="font-bold font-tabular text-emerald-600">{formatInr(e.amount_paid)}</div>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase tracking-wider text-slate-400">Pending</div>
                      <div className={`font-bold font-tabular ${bal > 0 ? "text-red-600" : "text-slate-500"}`}>
                        {formatInr(bal)}
                      </div>
                    </div>
                  </div>

                  {e.status !== "paid" ? (
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openPay(e)}
                        className="h-8 text-xs font-semibold border-[#519CAB] text-[#20373B]"
                      >
                        <IndianRupee className="w-3.5 h-3.5 mr-1 text-[#519CAB]" /> Pay Settlement
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => remind(e)}
                        className="h-8 text-xs text-[#519CAB]"
                      >
                        <Bell className="w-3.5 h-3.5 mr-1 text-[#FFC64F]" /> Remind
                      </Button>
                    </div>
                  ) : (
                    <div className="text-right text-xs text-emerald-600 font-semibold flex items-center justify-end gap-1 pt-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Fully Settled
                    </div>
                  )}
                </div>
              );
            })}
            {displayedEntries.length === 0 && (
              <div className="p-8 text-center text-slate-500 text-sm">No payout records in this period.</div>
            )}
          </div>

          {/* Tablet & Desktop Table View (hidden sm:block) */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm" data-testid="ledger-table">
            <thead className="bg-[#F4FAFC] text-[11px] uppercase tracking-wider text-[#20373B]/70 border-b border-[#C3E7F1]">
              <tr>
                <th className="text-left px-5 py-3 font-bold">Date</th>
                <th className="text-left px-5 py-3 font-bold">Description</th>
                <th className="text-right px-5 py-3 font-bold">Amount</th>
                <th className="text-right px-5 py-3 font-bold">Paid</th>
                <th className="text-right px-5 py-3 font-bold">Pending Due</th>
                <th className="text-left px-5 py-3 font-bold">Status</th>
                <th className="text-right px-5 py-3 font-bold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#C3E7F1]/50">
              {displayedEntries.map((e) => {
                const bal = Math.max(0, Number(e.amount) - Number(e.amount_paid));
                return (
                  <tr key={e.id} className="dense-row hover:bg-[#C3E7F1]/20 transition-colors" data-testid={`ledger-row-${e.id}`}>
                    <td className="px-5 py-3 text-slate-600">{formatDate(e.created_at)}</td>
                    <td className="px-5 py-3 font-semibold text-[#20373B]">
                      {e.description}
                      {e.reminders_sent > 0 && (
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {e.reminders_sent} reminder{e.reminders_sent > 1 && "s"} sent
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right font-tabular font-medium">{formatInr(e.amount)}</td>
                    <td className="px-5 py-3 text-right font-tabular font-bold text-emerald-600">{formatInr(e.amount_paid)}</td>
                    <td className={`px-5 py-3 text-right font-tabular font-bold ${bal > 0 ? "text-red-700" : "text-slate-500"}`}>{formatInr(bal)}</td>
                    <td className="px-5 py-3"><StatusPill status={e.status} /></td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      {e.status !== "paid" ? (
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="outline" size="sm" onClick={() => openPay(e)} className="h-8 border-[#519CAB] text-[#20373B] hover:bg-[#C3E7F1]/30 font-semibold" data-testid={`ledger-pay-${e.id}`}>
                            <IndianRupee className="w-3.5 h-3.5 mr-1 text-[#519CAB]" /> Pay
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => remind(e)} className="h-8 text-[#519CAB] hover:bg-[#C3E7F1]/20 font-semibold" data-testid={`ledger-remind-${e.id}`}>
                            <Bell className="w-3.5 h-3.5 mr-1 text-[#FFC64F]" /> Remind
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-emerald-600 font-semibold inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Fully Settled
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {displayedEntries.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-12 text-center text-slate-500">No payout records in this period.</td></tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Tab 2: Handover Deductions & Fuel/Wash (Car Owners Only) */}
      {isOwner && activeTab === "expenses" && (
        <div className="bg-white border border-[#C3E7F1] rounded-xl overflow-hidden shadow-xs">
          <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-[#C3E7F1] bg-[#F4FAFC] flex items-center justify-between">
            <div>
              <div className="font-display font-bold text-[#20373B] text-sm sm:text-base flex items-center gap-2">
                <Fuel className="w-4 h-4 text-amber-600" />
                Handover Expenses & Deductions {isMonthlyFilterActive && `(${selectedMonth})`}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                Extra fuel, washes, Fastag, or repairs paid out-of-pocket during this period
              </div>
            </div>
            {canWrite && (
              <Button
                size="sm"
                onClick={() => setExpenseModalOpen(true)}
                className="bg-[#20373B] hover:bg-[#2C494E] text-[#FFC64F] text-xs font-bold"
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> Add Charge
              </Button>
            )}
          </div>

          {/* Mobile Expense Cards (<sm) */}
          <div className="block sm:hidden divide-y divide-[#C3E7F1]/60">
            {expenses.map((exp) => (
              <div key={exp.id} className="p-3.5 space-y-2 bg-white">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      {getCategoryBadge(exp.category)}
                      <span className="font-bold text-[#20373B] text-sm font-tabular">{formatInr(exp.amount)}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1 font-medium">
                      {exp.car_registration ? `${exp.car_model || "Car"} (${exp.car_registration})` : "General / Fleet Vehicle"}
                    </div>
                  </div>
                  <div>
                    {exp.is_settled ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                        <Check className="w-3 h-3 text-emerald-600" /> Settled
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200">
                        Pending
                      </span>
                    )}
                  </div>
                </div>

                {exp.description && (
                  <div className="text-xs text-slate-600 bg-[#F4FAFC] p-2 rounded-lg border border-[#C3E7F1]/50 leading-relaxed">
                    {exp.description}
                  </div>
                )}

                <div className="flex items-center justify-between pt-1 text-xs">
                  <span className="text-[11px] text-slate-400">{formatDate(exp.date || exp.created_at)}</span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSettleExpense(exp, !exp.is_settled)}
                      className="h-7 text-xs font-semibold text-slate-700 hover:text-[#20373B]"
                    >
                      {exp.is_settled ? "Mark Pending" : "Mark Settled"}
                    </Button>
                    {canWrite && (
                      <button
                        type="button"
                        onClick={() => handleDeleteExpense(exp.id)}
                        className="p-1 text-slate-400 hover:text-red-600 transition-colors"
                        title="Delete expense"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {expenses.length === 0 && (
              <div className="p-8 text-center text-slate-500 text-sm">
                No handover charges recorded for this period.
              </div>
            )}
          </div>

          {/* Desktop & Tablet Table (hidden sm:block) */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F4FAFC] text-[11px] uppercase tracking-wider text-[#20373B]/70 border-b border-[#C3E7F1]">
                <tr>
                  <th className="text-left px-5 py-3 font-bold">Date</th>
                  <th className="text-left px-5 py-3 font-bold">Category</th>
                  <th className="text-left px-5 py-3 font-bold">Vehicle</th>
                  <th className="text-left px-5 py-3 font-bold">Details / Receipt</th>
                  <th className="text-right px-5 py-3 font-bold">Amount</th>
                  <th className="text-left px-5 py-3 font-bold">Status</th>
                  <th className="text-right px-5 py-3 font-bold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#C3E7F1]/50">
                {expenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-[#C3E7F1]/20 transition-colors">
                    <td className="px-5 py-3 text-slate-600 text-xs whitespace-nowrap">{formatDate(exp.date || exp.created_at)}</td>
                    <td className="px-5 py-3">{getCategoryBadge(exp.category)}</td>
                    <td className="px-5 py-3 font-medium text-[#20373B]">
                      {exp.car_registration ? (
                        <span>
                          {exp.car_model || "Car"} <span className="text-xs font-mono text-[#519CAB]">({exp.car_registration})</span>
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">General / Fleet</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-slate-600 text-xs max-w-xs truncate">
                      {exp.description || "—"}
                    </td>
                    <td className="px-5 py-3 text-right font-tabular font-bold text-amber-900 whitespace-nowrap">
                      {formatInr(exp.amount)}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      {exp.is_settled ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                          <Check className="w-3 h-3 text-emerald-600" /> Settled
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200">
                          Pending Deduction
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSettleExpense(exp, !exp.is_settled)}
                          className="h-7 text-xs font-medium text-slate-600 hover:text-[#20373B]"
                          title={exp.is_settled ? "Mark as pending deduction" : "Mark as settled"}
                        >
                          {exp.is_settled ? "Mark Pending" : "Mark Settled"}
                        </Button>
                        {canWrite && (
                          <button
                            type="button"
                            onClick={() => handleDeleteExpense(exp.id)}
                            className="p-1 text-slate-400 hover:text-red-600 transition-colors"
                            title="Delete expense"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {expenses.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-10 text-center text-slate-500 text-sm">
                      No handover charges recorded for this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Post Monthly Rent Dialog */}
      <Dialog open={monthlyRentModalOpen} onOpenChange={setMonthlyRentModalOpen}>
        <DialogContent className="w-[96vw] sm:max-w-md max-h-[90dvh] overflow-y-auto p-4 sm:p-6 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-purple-900 font-bold text-lg">
              <Calendar className="w-5 h-5 text-purple-700" />
              Post Monthly Retainer / Lease
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 text-xs">
            <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg text-purple-950 leading-relaxed">
              📅 <strong>Monthly Contract Rent:</strong> This posts the agreed fixed monthly lease payout to this owner's ledger for the specified billing month.
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Select Leased Vehicle</Label>
              <Select
                value={monthlyRentForm.car_id}
                onValueChange={(v) => {
                  const selCar = entity?.cars?.find((c) => c.id === v);
                  setMonthlyRentForm({
                    ...monthlyRentForm,
                    car_id: v,
                    amount: selCar?.monthly_cost_rate ? String(selCar.monthly_cost_rate) : monthlyRentForm.amount,
                  });
                }}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select car" />
                </SelectTrigger>
                <SelectContent>
                  {entity.cars?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.model} · {c.registration_no} {c.billing_type === "monthly" ? `(₹${c.monthly_cost_rate}/mo)` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Billing Month (YYYY-MM)</Label>
              <Input
                type="month"
                value={monthlyRentForm.month}
                onChange={(e) => setMonthlyRentForm({ ...monthlyRentForm, month: e.target.value })}
                className="h-9"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Agreed Monthly Rent (₹)</Label>
              <Input
                type="number"
                value={monthlyRentForm.amount}
                onChange={(e) => setMonthlyRentForm({ ...monthlyRentForm, amount: e.target.value })}
                placeholder="e.g. 30000"
                className="h-9 font-bold font-tabular"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Notes / Contract Reference</Label>
              <Input
                value={monthlyRentForm.notes}
                onChange={(e) => setMonthlyRentForm({ ...monthlyRentForm, notes: e.target.value })}
                placeholder="e.g. Full month fixed lease"
                className="h-9"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMonthlyRentModalOpen(false)}>Cancel</Button>
            <Button
              onClick={handlePostMonthlyRent}
              disabled={postingMonthlyRent}
              className="bg-purple-800 hover:bg-purple-900 text-white font-bold"
            >
              {postingMonthlyRent ? "Posting…" : "Post Monthly Rent to Statement"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Handover Expense Dialog */}
      <Dialog open={expenseModalOpen} onOpenChange={setExpenseModalOpen}>
        <DialogContent className="w-[96vw] sm:max-w-md max-h-[90dvh] overflow-y-auto p-4 sm:p-6 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#20373B] font-bold text-lg">
              <Fuel className="w-5 h-5 text-amber-600" />
              Add Handover Expense / Deduction
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 text-xs">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 leading-relaxed">
              💡 <strong>Handover Deduction:</strong> Record any fuel, washing, Fastag, or repairs paid out-of-pocket for this car. This will be deducted during payout settlement.
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Expense Category</Label>
              <Select
                value={expenseForm.category}
                onValueChange={(v) => setExpenseForm({ ...expenseForm, category: v })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fuel">⛽ Fuel (Petrol / Diesel)</SelectItem>
                  <SelectItem value="wash">🧼 Car Washing / Cleaning</SelectItem>
                  <SelectItem value="fastag">🏷️ Fastag / Toll</SelectItem>
                  <SelectItem value="maintenance">🔧 Maintenance / Minor Repair</SelectItem>
                  <SelectItem value="challan">⚠️ Traffic Fine / Challan</SelectItem>
                  <SelectItem value="other">📝 Other Incidental Expense</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Vehicle</Label>
              <Select
                value={expenseForm.car_id || "none"}
                onValueChange={(v) => setExpenseForm({ ...expenseForm, car_id: v === "none" ? "none" : v })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select vehicle" />
                </SelectTrigger>
                <SelectContent>
                  {entity.cars?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.model} · {c.registration_no}
                    </SelectItem>
                  ))}
                  <SelectItem value="none">General / Unspecified Vehicle</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Amount Paid (₹)</Label>
              <Input
                type="number"
                value={expenseForm.amount}
                onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                placeholder="e.g. 1000"
                className="h-9 font-tabular"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Description / Receipt Note</Label>
              <Input
                value={expenseForm.description}
                onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                placeholder="e.g. Full wash at Calangute / 10L petrol top-up"
                className="h-9"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Settlement Method</Label>
              <Select
                value={expenseForm.settlement_type}
                onValueChange={(v) => setExpenseForm({ ...expenseForm, settlement_type: v })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="deduct_from_payout">Deduct from next rental payout (Recommended)</SelectItem>
                  <SelectItem value="paid_by_owner">Paid directly by owner in cash/UPI</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExpenseModalOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSaveExpense}
              disabled={savingExpense}
              className="bg-[#20373B] hover:bg-[#2C494E] text-[#FFC64F] font-bold"
            >
              {savingExpense ? "Saving…" : "Save Handover Charge"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* WhatsApp Statement Generator Dialog */}
      <Dialog open={whatsAppModalOpen} onOpenChange={setWhatsAppModalOpen}>
        <DialogContent className="w-[96vw] sm:max-w-lg max-h-[90dvh] overflow-y-auto p-4 sm:p-6 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-700 font-bold text-lg">
              <MessageSquare className="w-5 h-5 text-emerald-600" />
              {isMonthlyFilterActive ? "Monthly WhatsApp Settlement Statement" : "WhatsApp Settlement Statement"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="text-xs text-slate-600">
              {isMonthlyFilterActive
                ? `Preview of the monthly invoice statement for ${selectedMonth}:`
                : "Preview of cumulative statement formatted for WhatsApp:"}
            </div>
            <Textarea
              value={buildWhatsAppText()}
              readOnly
              rows={13}
              className="font-mono text-xs leading-relaxed bg-[#F4FAFC] border-[#C3E7F1] resize-none"
            />
          </div>
          <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:justify-between">
            <Button
              variant="outline"
              onClick={copyWhatsApp}
              className="border-slate-300 text-slate-700 hover:bg-slate-50 font-bold text-xs"
            >
              {copied ? <Check className="w-4 h-4 mr-1 text-emerald-600" /> : <Copy className="w-4 h-4 mr-1" />}
              {copied ? "Copied!" : "Copy Statement"}
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setWhatsAppModalOpen(false)}>Close</Button>
              <Button
                onClick={openWhatsApp}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
              >
                <ExternalLink className="w-4 h-4 mr-1.5" /> Open WhatsApp
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Settlement Dialog */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="w-[96vw] sm:max-w-md max-h-[90dvh] overflow-y-auto p-4 sm:p-6 rounded-2xl">
          <DialogHeader><DialogTitle className="text-[#20373B] font-bold">Record Payment Settlement</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="p-3 bg-[#F4FAFC] border border-[#C3E7F1] rounded-lg text-xs text-[#20373B]">
              <strong>Details:</strong> {payEntry?.description}
            </div>
            {isOwner && unsettledExpAmt > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
                ⚠️ <strong>Notice:</strong> This owner has <strong>{formatInr(unsettledExpAmt)}</strong> in unsettled fuel/wash deductions. You can deduct it now from this payment if desired.
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Payment Amount (₹)</Label>
              <Input type="number" value={payAmt} onChange={(e) => setPayAmt(e.target.value)} placeholder="Amount" />
            </div>
            <div className="space-y-1.5">
              <Label>Payment Method / Note</Label>
              <Input value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="e.g. GPay, PhonePe, Cash..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(false)}>Cancel</Button>
            <Button onClick={submitPay} className="bg-[#20373B] hover:bg-[#2C494E] text-[#FFC64F] font-bold">Confirm Payment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={delOpen} onOpenChange={setDelOpen}>
        <DialogContent className="w-[96vw] sm:max-w-md p-5 sm:p-6 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600 text-lg font-bold">
              <div className="w-9 h-9 rounded-full bg-red-50 border border-red-200 flex items-center justify-center text-red-600 shrink-0">
                <Trash2 className="w-4 h-4" />
              </div>
              Delete {isOwner ? "Car Owner" : "Car Driver"}
            </DialogTitle>
          </DialogHeader>
          <div className="py-3 text-sm text-slate-600 space-y-2.5">
            <p>
              Are you sure you want to permanently delete <strong>{entity?.name}</strong>?
            </p>
            {isOwner && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 leading-relaxed">
                ⚠️ <strong>Note:</strong> All cars registered under this owner ({entity?.cars?.length || 0} vehicle{entity?.cars?.length === 1 ? "" : "s"}) will also be removed from the fleet.
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDelOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button
              onClick={deleteEntity}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 text-white font-bold cursor-pointer"
              data-testid="confirm-delete-detail-button"
            >
              {deleting ? "Deleting…" : `Yes, Delete ${isOwner ? "Owner" : "Driver"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

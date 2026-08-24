import React, { useEffect, useState } from "react";
import AppLayout from "@/components/AppLayout";
import StatusPill from "@/components/StatusPill";
import { api, formatInr, formatDate, formatApiError } from "@/lib/api";
import { calculateRentalDays, isDropAfter9AM, formatTime12h } from "@/lib/dateUtils";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Search, ShieldCheck, CreditCard, Banknote, RefreshCw } from "lucide-react";

const empty = {
  customer_name: "", customer_contact: "", customer_id_proof: "",
  car_id: "", start_date: "", end_date: "",
  pickup_time: "09:00", drop_time: "09:00",
  pickup_location: "", drop_location: "",
  daily_cost_rate: "", daily_customer_rate: "",
  cost_rate: "", customer_rate: "",
  payment_method: "cash",
  deposit_amount: "3000", deposit_status: "received",
  transfer_type: "none", flight_time: "", transfer_pickup_point: "",
  assigned_agent_id: "", agent_fee: "0", notes: "",
};

export default function BookingsPage() {
  const { user } = useAuth();
  const isOp = user?.role === "operator";
  const [rows, setRows] = useState([]);
  const [cars, setCars] = useState([]);
  const [agents, setAgents] = useState([]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    const [r, c, a] = await Promise.all([
      api.get("/bookings"),
      api.get("/cars"),
      isOp ? Promise.resolve({ data: [] }) : api.get("/agents"),
    ]);
    setRows(r.data);
    setCars(c.data);
    setAgents(a.data);
  };

  useEffect(() => { load(); }, []); // eslint-disable-line

  const filtered = rows.filter((b) => {
    if (statusFilter !== "all" && b.status !== statusFilter) return false;
    if (paymentFilter !== "all" && (b.payment_method || "cash") !== paymentFilter) return false;
    if (!q) return true;
    const s = q.toLowerCase();
    return (b.customer_name || "").toLowerCase().includes(s) ||
      (b.car_registration || "").toLowerCase().includes(s) ||
      (b.customer_contact || "").toLowerCase().includes(s);
  });

  const days = calculateRentalDays(form.start_date, form.end_date, form.pickup_time, form.drop_time);

  const recomputeRatesForDates = (sDate, eDate, pTime, dTime) => {
    const newDays = calculateRentalDays(sDate, eDate, pTime, dTime);
    const newCost = form.daily_cost_rate ? String(Number(form.daily_cost_rate) * newDays) : form.cost_rate;
    const newCustomer = form.daily_customer_rate ? String(Number(form.daily_customer_rate) * newDays) : form.customer_rate;
    return { days: newDays, cost_rate: newCost, customer_rate: newCustomer };
  };

  const onStartDateChange = (val) => {
    const rec = recomputeRatesForDates(val, form.end_date, form.pickup_time, form.drop_time);
    setForm({ ...form, start_date: val, cost_rate: rec.cost_rate, customer_rate: rec.customer_rate });
  };

  const onEndDateChange = (val) => {
    const rec = recomputeRatesForDates(form.start_date, val, form.pickup_time, form.drop_time);
    setForm({ ...form, end_date: val, cost_rate: rec.cost_rate, customer_rate: rec.customer_rate });
  };

  const onPickupTimeChange = (val) => {
    const rec = recomputeRatesForDates(form.start_date, form.end_date, val, form.drop_time);
    setForm({ ...form, pickup_time: val, cost_rate: rec.cost_rate, customer_rate: rec.customer_rate });
  };

  const onDropTimeChange = (val) => {
    const rec = recomputeRatesForDates(form.start_date, form.end_date, form.pickup_time, val);
    setForm({ ...form, drop_time: val, cost_rate: rec.cost_rate, customer_rate: rec.customer_rate });
  };

  const save = async () => {
    setSaving(true);
    try {
      const calcDays = calculateRentalDays(form.start_date, form.end_date, form.pickup_time, form.drop_time);
      const dailyCost = Number(form.daily_cost_rate || (form.cost_rate ? Number(form.cost_rate) / calcDays : 0));
      const dailyCustomer = Number(form.daily_customer_rate || (form.customer_rate ? Number(form.customer_rate) / calcDays : 0));
      const totalCost = Number(form.cost_rate || (dailyCost * calcDays));
      const totalCustomer = Number(form.customer_rate || (dailyCustomer * calcDays));
      const depositAmt = Number(form.deposit_amount || 0);

      const payload = {
        ...form,
        days: calcDays,
        pickup_time: form.pickup_time || "09:00",
        drop_time: form.drop_time || "09:00",
        payment_method: form.payment_method || "cash",
        deposit_amount: depositAmt,
        deposit_status: depositAmt > 0 ? (form.deposit_status || "received") : "none",
        daily_cost_rate: dailyCost,
        daily_customer_rate: dailyCustomer,
        cost_rate: totalCost,
        customer_rate: totalCustomer,
        agent_fee: Number(form.agent_fee || 0),
        assigned_agent_id: form.assigned_agent_id || null,
      };
      if (editing) {
        await api.put(`/bookings/${editing.id}`, payload);
        toast.success("Booking updated");
      } else {
        await api.post("/bookings", payload);
        toast.success("Booking created");
      }
      setOpen(false); setEditing(null); setForm(empty); await load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (b) => {
    setEditing(b);
    const bDays = b.days || calculateRentalDays(b.start_date, b.end_date, b.pickup_time, b.drop_time);
    const dCost = b.daily_cost_rate || (bDays > 0 ? Number(b.cost_rate) / bDays : b.cost_rate);
    const dCust = b.daily_customer_rate || (bDays > 0 ? Number(b.customer_rate) / bDays : b.customer_rate);

    setForm({
      ...empty,
      customer_name: b.customer_name || "",
      customer_contact: b.customer_contact || "",
      customer_id_proof: b.customer_id_proof || "",
      car_id: b.car_id || "",
      start_date: (b.start_date || "").slice(0, 10),
      end_date: (b.end_date || "").slice(0, 10),
      pickup_time: b.pickup_time || "09:00",
      drop_time: b.drop_time || "09:00",
      payment_method: b.payment_method || "cash",
      deposit_amount: String(b.deposit_amount ?? "0"),
      deposit_status: b.deposit_status || "none",
      pickup_location: b.pickup_location || "",
      drop_location: b.drop_location || "",
      daily_cost_rate: dCost ? String(dCost) : "",
      daily_customer_rate: dCust ? String(dCust) : "",
      cost_rate: b.cost_rate ? String(b.cost_rate) : "",
      customer_rate: b.customer_rate ? String(b.customer_rate) : "",
      transfer_type: b.transfer_type || "none",
      flight_time: b.flight_time || "",
      transfer_pickup_point: b.transfer_pickup_point || "",
      assigned_agent_id: b.assigned_agent_id || "",
      agent_fee: b.agent_fee ?? "0",
      notes: b.notes || "",
    });
    setOpen(true);
  };

  const refundDeposit = async (b) => {
    if (!window.confirm(`Refund security deposit of ₹${Number(b.deposit_amount || 0).toLocaleString('en-IN')} to ${b.customer_name}?`)) return;
    try {
      await api.put(`/bookings/${b.id}/refund-deposit`, {});
      toast.success(`Deposit of ${formatInr(b.deposit_amount)} refunded to ${b.customer_name}`);
      await load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed to refund deposit");
    }
  };

  const updateStatus = async (b, s) => {
    try {
      await api.put(`/bookings/${b.id}`, { status: s });
      toast.success(`Status → ${s.replace("_", " ")}`);
      await load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  };

  const del = async (b) => {
    if (!window.confirm(`Delete booking for ${b.customer_name}?`)) return;
    try {
      await api.delete(`/bookings/${b.id}`);
      toast.success("Booking deleted");
      await load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  };

  const computedTotalCustomer = form.daily_customer_rate ? Number(form.daily_customer_rate) * days : Number(form.customer_rate || 0);
  const computedTotalCost = form.daily_cost_rate ? Number(form.daily_cost_rate) * days : Number(form.cost_rate || 0);
  const computedMargin = computedTotalCustomer - computedTotalCost;
  const computedNet = computedMargin - Number(form.agent_fee || 0);

  return (
    <AppLayout
      title="Bookings"
      subtitle={`${rows.length} total · ${filtered.length} shown`}
      actions={
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditing(null); setForm(empty); } }}>
          <DialogTrigger asChild>
            <Button className="bg-[#20373B] hover:bg-[#2C494E] text-[#FFC64F] font-bold shadow-md" data-testid="new-booking-button">
              <Plus className="w-4 h-4 mr-1" /> New booking
            </Button>
          </DialogTrigger>
          <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[88vh] overflow-y-auto p-4 sm:p-6">
            <DialogHeader>
              <DialogTitle className="text-[#20373B] font-bold text-lg">{editing ? "Edit booking" : "New booking"}</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 py-2">
              <Field label="Customer name">
                <Input value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} data-testid="booking-customer-name" placeholder="e.g. Rajesh Sharma" />
              </Field>
              <Field label="Customer contact">
                <Input value={form.customer_contact} onChange={(e) => setForm({ ...form, customer_contact: e.target.value })} data-testid="booking-customer-contact" placeholder="+91 98765 43210" />
              </Field>
              <Field label="ID proof">
                <Input value={form.customer_id_proof} onChange={(e) => setForm({ ...form, customer_id_proof: e.target.value })} placeholder="Aadhaar/DL last 4" />
              </Field>
              <Field label="Car">
                <Select value={form.car_id} onValueChange={(v) => {
                  const c = cars.find((x) => x.id === v);
                  const rate = c?.default_cost_rate ? String(c.default_cost_rate) : form.daily_cost_rate;
                  const totalCost = rate ? String(Number(rate) * days) : form.cost_rate;
                  setForm({ ...form, car_id: v, daily_cost_rate: rate, cost_rate: totalCost });
                }}>
                  <SelectTrigger data-testid="booking-car-select"><SelectValue placeholder="Select car" /></SelectTrigger>
                  <SelectContent>
                    {cars.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.model} · {c.registration_no}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              {/* Pickup Date + Time */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600">Pickup Date & Time</Label>
                <div className="grid grid-cols-5 gap-1.5">
                  <Input
                    type="date"
                    value={form.start_date}
                    onChange={(e) => onStartDateChange(e.target.value)}
                    data-testid="booking-start-date"
                    className="col-span-3"
                  />
                  <Input
                    type="time"
                    value={form.pickup_time || "09:00"}
                    onChange={(e) => onPickupTimeChange(e.target.value)}
                    data-testid="booking-pickup-time"
                    className="col-span-2 text-xs"
                  />
                </div>
              </div>

              {/* Drop Date + Time */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600">Drop-off Date & Time</Label>
                <div className="grid grid-cols-5 gap-1.5">
                  <Input
                    type="date"
                    value={form.end_date}
                    onChange={(e) => onEndDateChange(e.target.value)}
                    data-testid="booking-end-date"
                    className="col-span-3"
                  />
                  <Input
                    type="time"
                    value={form.drop_time || "09:00"}
                    onChange={(e) => onDropTimeChange(e.target.value)}
                    data-testid="booking-drop-time"
                    className="col-span-2 text-xs"
                  />
                </div>
              </div>

              {/* Live Duration Pill with 9AM Rule Badge */}
              <div className="sm:col-span-2 bg-[#F4FAFC] border border-[#C3E7F1] p-3 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[#20373B] flex items-center gap-1.5">
                    <span>⏱️ Rental Duration:</span>
                    <span className="bg-[#20373B] text-[#FFC64F] px-2.5 py-0.5 rounded-md font-bold text-xs">
                      {days} Day{days > 1 ? "s" : ""}
                    </span>
                  </span>
                  {isDropAfter9AM(form.drop_time) && (
                    <span className="bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-md font-semibold text-[11px]">
                      ⚡ Drop after 9:00 AM (+1 day charged)
                    </span>
                  )}
                </div>
                <div className="text-[#519CAB] font-semibold text-[11px] text-right">
                  {form.start_date ? formatDate(form.start_date) : "—"} {formatTime12h(form.pickup_time)} → {form.end_date ? formatDate(form.end_date) : "—"} {formatTime12h(form.drop_time)}
                </div>
              </div>

              {/* Payment Method Selector */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-[#20373B]">Payment Method</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, payment_method: "cash" })}
                    className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold border transition-all ${
                      form.payment_method === "cash"
                        ? "bg-emerald-50 border-emerald-500 text-emerald-800 shadow-xs"
                        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <Banknote className="w-4 h-4 text-emerald-600" />
                    Cash
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, payment_method: "online" })}
                    className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold border transition-all ${
                      form.payment_method === "online"
                        ? "bg-blue-50 border-blue-500 text-blue-800 shadow-xs"
                        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <CreditCard className="w-4 h-4 text-blue-600" />
                    Online (UPI/Bank)
                  </button>
                </div>
              </div>

              {/* Security Deposit Amount with Quick Select Box */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-[#20373B]">Security Deposit (₹)</Label>
                <div className="space-y-1.5">
                  <Input
                    type="number"
                    value={form.deposit_amount}
                    onChange={(e) => setForm({ ...form, deposit_amount: e.target.value })}
                    placeholder="e.g. 3000"
                    className="border-[#C3E7F1]"
                    data-testid="booking-deposit-input"
                  />
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {["0", "2000", "3000", "5000"].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setForm({ ...form, deposit_amount: amt })}
                        className={`text-[11px] px-2 py-0.5 rounded-md font-semibold border ${
                          form.deposit_amount === amt
                            ? "bg-[#20373B] text-[#FFC64F] border-[#20373B]"
                            : "bg-white border-[#C3E7F1] text-slate-700 hover:bg-[#F4FAFC]"
                        }`}
                      >
                        {amt === "0" ? "₹0 (None)" : `₹${Number(amt).toLocaleString("en-IN")}`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <Field label="Pickup location">
                <Input value={form.pickup_location} onChange={(e) => setForm({ ...form, pickup_location: e.target.value })} placeholder="e.g. MOPA Airport / Panjim" />
              </Field>
              <Field label="Drop location">
                <Input value={form.drop_location} onChange={(e) => setForm({ ...form, drop_location: e.target.value })} placeholder="e.g. Calangute / Airport" />
              </Field>

              {!isOp && (
                <>
                  <Field label={`Car Owner Rate / Day (₹/day)`}>
                    <Input
                      type="number"
                      value={form.daily_cost_rate}
                      onChange={(e) => {
                        const v = e.target.value;
                        setForm({ ...form, daily_cost_rate: v, cost_rate: v ? String(Number(v) * days) : "" });
                      }}
                      data-testid="booking-daily-cost-rate"
                      placeholder="e.g. 1800"
                    />
                    {form.daily_cost_rate && (
                      <div className="text-[11px] text-slate-500 mt-1">
                        Total Cost: {days} days × ₹{Number(form.daily_cost_rate).toLocaleString("en-IN")} = <strong className="text-red-700 font-bold">₹{(Number(form.daily_cost_rate) * days).toLocaleString("en-IN")}</strong>
                      </div>
                    )}
                  </Field>
                  <Field label={`Customer Selling Rate / Day (₹/day)`}>
                    <Input
                      type="number"
                      value={form.daily_customer_rate}
                      onChange={(e) => {
                        const v = e.target.value;
                        setForm({ ...form, daily_customer_rate: v, customer_rate: v ? String(Number(v) * days) : "" });
                      }}
                      data-testid="booking-daily-customer-rate"
                      placeholder="e.g. 2600"
                    />
                    {form.daily_customer_rate && (
                      <div className="text-[11px] text-slate-500 mt-1">
                        Total Sales: {days} days × ₹{Number(form.daily_customer_rate).toLocaleString("en-IN")} = <strong className="text-[#20373B] font-bold">₹{(Number(form.daily_customer_rate) * days).toLocaleString("en-IN")}</strong>
                      </div>
                    )}
                  </Field>
                </>
              )}

              {isOp && (
                <Field label={`Customer Selling Rate / Day (₹/day)`}>
                  <Input
                    type="number"
                    value={form.daily_customer_rate}
                    onChange={(e) => {
                      const v = e.target.value;
                      setForm({ ...form, daily_customer_rate: v, customer_rate: v ? String(Number(v) * days) : "" });
                    }}
                    data-testid="booking-daily-customer-rate"
                    placeholder="e.g. 2600"
                  />
                  {form.daily_customer_rate && (
                    <div className="text-[11px] text-slate-500 mt-1">
                      Total Sales: {days} days × ₹{Number(form.daily_customer_rate).toLocaleString("en-IN")} = <strong className="text-[#20373B] font-bold">₹{(Number(form.daily_customer_rate) * days).toLocaleString("en-IN")}</strong>
                    </div>
                  )}
                </Field>
              )}

              <Field label="Airport transfer">
                <Select value={form.transfer_type} onValueChange={(v) => setForm({ ...form, transfer_type: v })}>
                  <SelectTrigger data-testid="booking-transfer-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No transfer</SelectItem>
                    <SelectItem value="airport_pickup">Airport pickup (₹1000)</SelectItem>
                    <SelectItem value="airport_drop">Airport drop (₹1000)</SelectItem>
                    <SelectItem value="both">Both (₹2000)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              {form.transfer_type !== "none" && (
                <>
                  <Field label="Flight time">
                    <Input value={form.flight_time} onChange={(e) => setForm({ ...form, flight_time: e.target.value })} placeholder="e.g. 18:30" />
                  </Field>
                  <Field label="Transfer pickup point">
                    <Input value={form.transfer_pickup_point} onChange={(e) => setForm({ ...form, transfer_pickup_point: e.target.value })} />
                  </Field>
                  {!isOp && (
                    <>
                      <Field label="Assigned car driver (optional)">
                        <Select value={form.assigned_agent_id || "none"} onValueChange={(v) => setForm({ ...form, assigned_agent_id: v === "none" ? "" : v })}>
                          <SelectTrigger><SelectValue placeholder="No car driver (in-house)" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">In-house (no car driver)</SelectItem>
                            {agents.map((a) => (
                              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Driver fee (₹)">
                        <Input type="number" value={form.agent_fee} onChange={(e) => setForm({ ...form, agent_fee: e.target.value })} />
                      </Field>
                    </>
                  )}
                </>
              )}
              <div className="sm:col-span-2">
                <Field label="Notes">
                  <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Customer preferences, advance payment details..." />
                </Field>
              </div>

              {/* Live Calculation Summary Banner */}
              {!isOp && (computedTotalCustomer > 0 || computedTotalCost > 0) && (
                <div className="sm:col-span-2 rounded-xl bg-[#F4FAFC] border border-[#C3E7F1] p-3.5 space-y-1.5 text-xs">
                  <div className="font-bold text-[#20373B] text-xs uppercase tracking-wider mb-1">
                    📊 Booking Financial Calculation ({days} Day{days > 1 ? "s" : ""})
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center pt-1">
                    <div className="bg-white p-2 rounded-lg border border-[#C3E7F1]">
                      <div className="text-[10px] text-slate-400 font-semibold uppercase">Total Customer</div>
                      <div className="font-bold font-tabular text-[#20373B] text-sm mt-0.5">{formatInr(computedTotalCustomer)}</div>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-[#C3E7F1]">
                      <div className="text-[10px] text-slate-400 font-semibold uppercase">Total Owner Rent</div>
                      <div className="font-bold font-tabular text-red-700 text-sm mt-0.5">{formatInr(computedTotalCost)}</div>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-[#C3E7F1]">
                      <div className="text-[10px] text-slate-400 font-semibold uppercase">Gross Margin</div>
                      <div className="font-bold font-tabular text-emerald-700 text-sm mt-0.5">{formatInr(computedMargin)}</div>
                    </div>
                    <div className="bg-emerald-50 p-2 rounded-lg border border-emerald-200">
                      <div className="text-[10px] text-emerald-800 font-semibold uppercase">Net Take-Home</div>
                      <div className="font-extrabold font-tabular text-emerald-800 text-sm mt-0.5">{formatInr(computedNet)}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={save} disabled={saving} className="bg-[#20373B] hover:bg-[#2C494E] text-[#FFC64F] font-bold" data-testid="booking-save-button">
                {saving ? "Saving…" : (editing ? "Save changes" : "Create booking")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      }
    >
      <div className="bg-white border border-[#C3E7F1] rounded-xl overflow-hidden shadow-xs">
        <div className="p-3 sm:px-5 sm:py-3.5 border-b border-[#C3E7F1] flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3 bg-[#F4FAFC]">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Search customer, phone, car plate…"
              className="pl-9 h-9 bg-white border-[#C3E7F1]" data-testid="bookings-search" />
          </div>
          <Select value={paymentFilter} onValueChange={setPaymentFilter}>
            <SelectTrigger className="w-full sm:w-40 h-9 bg-white border-[#C3E7F1]" data-testid="bookings-payment-filter"><SelectValue placeholder="All Payments" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Payments</SelectItem>
              <SelectItem value="cash">💵 Cash Only</SelectItem>
              <SelectItem value="online">💳 Online Only</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-44 h-9 bg-white border-[#C3E7F1]" data-testid="bookings-status-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="reserved">Reserved</SelectItem>
              <SelectItem value="car_received">Car received</SelectItem>
              <SelectItem value="with_customer">With customer</SelectItem>
              <SelectItem value="returned">Returned</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* 📱 Mobile Cards View (<sm) */}
        <div className="block sm:hidden divide-y divide-[#C3E7F1]/60">
          {filtered.map((b) => {
            const bDays = b.days || calculateRentalDays(b.start_date, b.end_date, b.pickup_time, b.drop_time);
            const isCash = (b.payment_method || "cash") === "cash";
            const depAmt = Number(b.deposit_amount || 0);

            return (
              <div key={b.id} className="p-3.5 space-y-2.5 bg-white" data-testid={`booking-card-${b.id}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-bold text-[#20373B] text-base leading-snug">{b.customer_name}</div>
                    <a
                      href={`tel:${b.customer_contact}`}
                      className="text-xs text-[#519CAB] font-semibold flex items-center gap-1 mt-0.5"
                    >
                      📞 {b.customer_contact}
                    </a>
                  </div>
                  <div className="text-right">
                    <span className="inline-block px-2 py-0.5 rounded-md bg-[#F4FAFC] border border-[#C3E7F1] text-[11px] font-mono font-bold text-[#20373B]">
                      {b.car_registration}
                    </span>
                    <div className="text-[11px] text-slate-500 font-medium">{b.car_model}</div>
                  </div>
                </div>

                {/* Dates & Status */}
                <div className="flex items-center justify-between text-xs bg-[#F4FAFC] p-2.5 rounded-lg border border-[#C3E7F1]/60">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-1.5">
                      <span>Rental:</span>
                      <span className="text-[#519CAB] font-bold">{bDays} Day{bDays > 1 ? "s" : ""}</span>
                      <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${isCash ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800"}`}>
                        {isCash ? "💵 Cash" : "💳 Online"}
                      </span>
                    </div>
                    <div className="font-semibold text-slate-800 mt-0.5 text-[11px]">
                      {formatDate(b.start_date)} {formatTime12h(b.pickup_time)} → {formatDate(b.end_date)} {formatTime12h(b.drop_time)}
                    </div>
                  </div>
                  <div>
                    <Select value={b.status} onValueChange={(v) => updateStatus(b, v)}>
                      <SelectTrigger className="h-7 w-32 text-xs bg-white border-[#C3E7F1]" data-testid={`booking-mobile-status-${b.id}`}>
                        <SelectValue><StatusPill status={b.status} /></SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {["reserved","car_received","with_customer","returned","cancelled"].map((s) => (
                          <SelectItem key={s} value={s}>{s.replace(/_/g," ")}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Deposit Badge Strip (if deposit exists) */}
                {depAmt > 0 && (
                  <div className="flex items-center justify-between px-2.5 py-1.5 rounded-md bg-amber-50/60 border border-amber-200 text-xs">
                    <span className="flex items-center gap-1 font-medium text-amber-900">
                      <ShieldCheck className="w-3.5 h-3.5 text-amber-700" />
                      Deposit: <strong>{formatInr(depAmt)}</strong>
                    </span>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                        b.deposit_status === "refunded" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                      }`}>
                        {b.deposit_status === "refunded" ? "Refunded" : "Received (Held)"}
                      </span>
                      {b.deposit_status === "received" && (
                        <button
                          type="button"
                          onClick={() => refundDeposit(b)}
                          className="text-[10px] text-emerald-700 hover:text-emerald-900 font-bold underline"
                        >
                          Refund
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Financials Strip */}
                {(() => {
                  const dCust = b.daily_customer_rate || (bDays > 0 ? b.customer_rate / bDays : b.customer_rate);
                  const dCost = b.daily_cost_rate || (bDays > 0 ? b.cost_rate / bDays : b.cost_rate);
                  return (
                    <div className="grid grid-cols-3 gap-2 text-center p-2.5 rounded-lg bg-[#20373B]/5 border border-[#C3E7F1]/50 text-xs">
                      <div>
                        <div className="text-[9px] uppercase tracking-wider text-slate-500">Customer Sales</div>
                        <div className="font-bold font-tabular text-[#20373B] text-sm">{formatInr(b.customer_rate)}</div>
                        {bDays > 1 && <div className="text-[10px] text-slate-400 font-tabular">₹{Math.round(dCust)}/d</div>}
                      </div>
                      {!isOp && (
                        <div>
                          <div className="text-[9px] uppercase tracking-wider text-slate-500">Owner Rent</div>
                          <div className="font-bold font-tabular text-red-700 text-sm">{formatInr(b.cost_rate)}</div>
                          {bDays > 1 && <div className="text-[10px] text-slate-400 font-tabular">₹{Math.round(dCost)}/d</div>}
                        </div>
                      )}
                      {!isOp && (
                        <div>
                          <div className="text-[9px] uppercase tracking-wider text-slate-500">Net Profit</div>
                          <div className="font-extrabold font-tabular text-emerald-700 text-sm">{formatInr(b.margin)}</div>
                          <div className="text-[10px] text-emerald-600 font-semibold">{bDays}d profit</div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Action Buttons */}
                <div className="flex items-center justify-end gap-2 pt-1">
                  {depAmt > 0 && b.deposit_status === "received" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => refundDeposit(b)}
                      className="h-8 text-xs font-semibold text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                    >
                      <RefreshCw className="w-3 h-3 mr-1" /> Refund Deposit
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEdit(b)}
                    className="h-8 text-xs font-semibold border-[#C3E7F1] text-[#20373B]"
                  >
                    Edit Booking
                  </Button>
                  {!isOp && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => del(b)}
                      className="h-8 text-xs font-semibold text-red-600 hover:bg-red-50"
                    >
                      Delete
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="p-8 text-center text-slate-500 text-sm">No bookings match your filters.</div>
          )}
        </div>

        {/* 💻 Desktop & Tablet Table View (hidden sm:block) */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-sm" data-testid="bookings-table">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="text-left px-5 py-2.5 font-semibold">Dates & Times</th>
                <th className="text-left px-5 py-2.5 font-semibold">Customer</th>
                <th className="text-left px-5 py-2.5 font-semibold">Car</th>
                <th className="text-left px-5 py-2.5 font-semibold">Payment</th>
                <th className="text-left px-5 py-2.5 font-semibold">Deposit</th>
                <th className="text-left px-5 py-2.5 font-semibold">Status</th>
                <th className="text-left px-5 py-2.5 font-semibold">Transfer</th>
                {!isOp && <th className="text-right px-5 py-2.5 font-semibold">Car Cost</th>}
                <th className="text-right px-5 py-2.5 font-semibold">Customer Rate</th>
                {!isOp && <th className="text-right px-5 py-2.5 font-semibold">Net Margin</th>}
                <th className="text-right px-5 py-2.5 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((b) => {
                const bDays = b.days || calculateRentalDays(b.start_date, b.end_date, b.pickup_time, b.drop_time);
                const dCust = b.daily_customer_rate || (bDays > 0 ? b.customer_rate / bDays : b.customer_rate);
                const dCost = b.daily_cost_rate || (bDays > 0 ? b.cost_rate / bDays : b.cost_rate);
                const isCash = (b.payment_method || "cash") === "cash";
                const depAmt = Number(b.deposit_amount || 0);

                return (
                  <tr key={b.id} className="dense-row" data-testid={`booking-row-${b.id}`}>
                    <td className="px-5 py-2.5 whitespace-nowrap">
                      <div className="font-medium text-[#20373B] text-xs">
                        {formatDate(b.start_date)} <span className="text-slate-500 font-normal">({formatTime12h(b.pickup_time)})</span>
                        {" → "}
                        {formatDate(b.end_date)} <span className="text-slate-500 font-normal">({formatTime12h(b.drop_time)})</span>
                      </div>
                      <div className="text-xs font-bold text-[#519CAB] flex items-center gap-1 mt-0.5">
                        <span>⏱️ {bDays} Day{bDays > 1 ? "s" : ""}</span>
                        {isDropAfter9AM(b.drop_time) && (
                          <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                            9AM+ rule
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-2.5">
                      <div className="font-medium text-slate-900">{b.customer_name}</div>
                      <div className="text-xs text-slate-500">{b.customer_contact}</div>
                    </td>
                    <td className="px-5 py-2.5">
                      <div className="text-slate-700">{b.car_model}</div>
                      <div className="text-xs text-slate-500 font-mono">{b.car_registration}</div>
                    </td>
                    <td className="px-5 py-2.5 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                        isCash ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-blue-50 text-blue-800 border border-blue-200"
                      }`}>
                        {isCash ? <Banknote className="w-3 h-3 text-emerald-600" /> : <CreditCard className="w-3 h-3 text-blue-600" />}
                        {isCash ? "Cash" : "Online"}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 whitespace-nowrap">
                      {depAmt > 0 ? (
                        <div className="space-y-0.5">
                          <div className="font-bold text-xs font-tabular text-[#20373B]">{formatInr(depAmt)}</div>
                          <span className={`inline-block text-[10px] font-bold uppercase px-1.5 py-0.2 rounded ${
                            b.deposit_status === "refunded" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                          }`}>
                            {b.deposit_status === "refunded" ? "Refunded" : "Received"}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">₹0 (None)</span>
                      )}
                    </td>
                    <td className="px-5 py-2.5">
                      <Select value={b.status} onValueChange={(v) => updateStatus(b, v)}>
                        <SelectTrigger className="w-32 h-8 text-xs" data-testid={`booking-status-${b.id}`}>
                          <SelectValue><StatusPill status={b.status} /></SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {["reserved","car_received","with_customer","returned","cancelled"].map((s) => (
                            <SelectItem key={s} value={s}>{s.replace(/_/g," ")}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-5 py-2.5">
                      {b.transfer_type && b.transfer_type !== "none"
                        ? <StatusPill status={b.transfer_status || "scheduled"} />
                        : <span className="text-xs text-slate-400">—</span>}
                    </td>
                    {!isOp && (
                      <td className="px-5 py-2.5 text-right font-tabular">
                        <div className="font-bold text-red-700">{formatInr(b.cost_rate)}</div>
                        {bDays > 1 && <div className="text-[10px] text-slate-400">₹{Math.round(dCost)}/day</div>}
                      </td>
                    )}
                    <td className="px-5 py-2.5 text-right font-tabular">
                      <div className="font-bold text-[#20373B]">{formatInr(b.customer_rate)}</div>
                      {bDays > 1 && <div className="text-[10px] text-slate-400">₹{Math.round(dCust)}/day</div>}
                    </td>
                    {!isOp && (
                      <td className="px-5 py-2.5 text-right font-tabular">
                        <div className="text-emerald-700 font-extrabold text-[15px]">{formatInr(b.margin)}</div>
                      </td>
                    )}
                    <td className="px-5 py-2.5 text-right whitespace-nowrap space-x-1">
                      {depAmt > 0 && b.deposit_status === "received" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => refundDeposit(b)}
                          className="text-xs text-emerald-700 border-emerald-300 hover:bg-emerald-50 h-8"
                          title="Refund security deposit"
                        >
                          Refund Dep.
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => openEdit(b)} data-testid={`booking-edit-${b.id}`}>Edit</Button>
                      {!isOp && (
                        <Button variant="ghost" size="sm" onClick={() => del(b)} className="text-red-600 hover:text-red-700" data-testid={`booking-delete-${b.id}`}>Delete</Button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={isOp ? 8 : 11} className="px-5 py-12 text-center text-slate-500">No bookings match your filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}

function Field({ label, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-slate-600">{label}</Label>
      {children}
    </div>
  );
}

import React, { useEffect, useState } from "react";
import AppLayout from "@/components/AppLayout";
import StatusPill from "@/components/StatusPill";
import { api, API, formatInr, formatDate, formatApiError } from "@/lib/api";
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
import { Plus, Search, ShieldCheck, CreditCard, Banknote, RefreshCw, Table2, FileText, Download, Fuel, Droplets, Plane, User, Car } from "lucide-react";

const empty = {
  customer_name: "", customer_contact: "", customer_id_proof: "",
  car_selection_mode: "fleet", // "fleet" | "direct"
  car_id: "",
  owner_id: "",
  owner_name: "",
  owner_contact: "",
  car_model: "",
  car_registration: "TBD",
  start_date: "", end_date: "",
  pickup_time: "09:00", drop_time: "09:00",
  pickup_location: "", drop_location: "",
  daily_cost_rate: "", daily_customer_rate: "",
  cost_rate: "", customer_rate: "",
  payment_method: "cash",
  deposit_amount: "3000", deposit_status: "received",
  transfer_type: "none",
  transfer_handled_by: "self",
  transfer_cost: "1000",
  transfer_driver_share: "0",
  transfer_manoj_share: "1000",
  driver_name: "Owner (Self)",
  driver_contact: "",
  transfer_driver_paid: true,
  flight_time: "", transfer_pickup_point: "",
  assigned_agent_id: "", agent_fee: "0", notes: "",
};

export default function BookingsPage() {
  const { user } = useAuth();
  const isOp = user?.role === "operator";
  const [rows, setRows] = useState([]);
  const [cars, setCars] = useState([]);
  const [owners, setOwners] = useState([]);
  const [agents, setAgents] = useState([]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);

  // Quick Assign Plate Modal state
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignTargetBooking, setAssignTargetBooking] = useState(null);
  const [assignPlateInput, setAssignPlateInput] = useState("");
  const [assignCarModelInput, setAssignCarModelInput] = useState("");
  const [assigningPlate, setAssigningPlate] = useState(false);

  // Handover intake modal state (fuel & wash charges)
  const [intakeModalOpen, setIntakeModalOpen] = useState(false);
  const [intakeBooking, setIntakeBooking] = useState(null);
  const [intakeForm, setIntakeForm] = useState({ fuel_amount: "", wash_amount: "", notes: "" });
  const [savingIntake, setSavingIntake] = useState(false);

  const load = async () => {
    const [r, c, a, o] = await Promise.all([
      api.get("/bookings"),
      api.get("/cars"),
      isOp ? Promise.resolve({ data: [] }) : api.get("/agents"),
      api.get("/owners").catch(() => ({ data: [] })),
    ]);
    setRows(r.data);
    setCars(c.data);
    setAgents(a.data);
    setOwners(o.data || []);
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

      const isDirect = form.car_selection_mode === "direct";

      const payload = {
        ...form,
        car_id: isDirect ? null : (form.car_id || null),
        owner_id: isDirect ? (form.owner_id || null) : null,
        owner_name: isDirect ? form.owner_name : "",
        owner_contact: isDirect ? form.owner_contact : "",
        car_model: isDirect ? (form.car_model || "Standard Vehicle") : "",
        car_registration: isDirect ? (form.car_registration || "TBD") : "",
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
        transfer_type: form.transfer_type || "none",
        transfer_handled_by: form.transfer_handled_by || "self",
        transfer_cost: Number(form.transfer_cost || (form.transfer_type === "both" ? 2000 : 1000)),
        transfer_driver_share: form.transfer_handled_by === "self" ? 0 : Number(form.transfer_driver_share || 400),
        transfer_manoj_share: form.transfer_handled_by === "self" ? Number(form.transfer_cost || 1000) : Number(form.transfer_manoj_share || 600),
        transfer_driver_paid: form.transfer_handled_by === "self" ? true : Boolean(form.transfer_driver_paid),
        driver_name: form.transfer_handled_by === "self" ? "Owner (Self)" : (form.driver_name || "Driver"),
        driver_contact: form.driver_contact || "",
        flight_time: form.flight_time || "",
        transfer_pickup_point: form.transfer_pickup_point || "",
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
      car_selection_mode: b.car_id ? "fleet" : "direct",
      car_id: b.car_id || "",
      owner_id: b.owner_id || "",
      owner_name: b.owner_name || "",
      owner_contact: "",
      car_model: b.car_model || "",
      car_registration: b.car_registration || "TBD",
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
      transfer_handled_by: b.transfer_handled_by || (b.driver_name === "Owner (Self)" || Number(b.driver_fee) === 0 ? "self" : "driver"),
      transfer_cost: String(b.transfer_cost || (b.transfer_type === "both" ? 2000 : 1000)),
      transfer_driver_share: String(b.transfer_driver_share ?? 0),
      transfer_manoj_share: String(b.transfer_manoj_share ?? (b.transfer_cost || 1000)),
      transfer_driver_paid: Boolean(b.transfer_driver_paid),
      driver_name: b.driver_name || "Owner (Self)",
      driver_contact: b.driver_contact || "",
      flight_time: b.flight_time || "",
      transfer_pickup_point: b.transfer_pickup_point || "",
      assigned_agent_id: b.assigned_agent_id || "",
      agent_fee: b.agent_fee ?? "0",
      notes: b.notes || "",
    });
    setOpen(true);
  };

  const saveAssignedPlate = async () => {
    if (!assignTargetBooking) return;
    setAssigningPlate(true);
    try {
      await api.put(`/bookings/${assignTargetBooking.id}/assign-car`, {
        car_registration: assignPlateInput.trim() || "TBD",
        car_model: assignCarModelInput.trim() || assignTargetBooking.car_model,
      });
      toast.success(`Plate updated to ${assignPlateInput.trim() || "TBD"}`);
      setAssignModalOpen(false);
      setAssignTargetBooking(null);
      await load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed to assign car plate");
    } finally {
      setAssigningPlate(false);
    }
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
    if (s === "car_received") {
      setIntakeBooking(b);
      setIntakeForm({ fuel_amount: "", wash_amount: "", notes: "" });
      setIntakeModalOpen(true);
      return;
    }
    try {
      await api.put(`/bookings/${b.id}`, { status: s });
      toast.success(`Status → ${s.replace("_", " ")}`);
      await load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  };

  const submitHandoverIntake = async (skipCharges = false) => {
    if (!intakeBooking) return;
    setSavingIntake(true);
    try {
      const payload = {
        status: "car_received",
        fuel_amount: skipCharges ? 0 : Number(intakeForm.fuel_amount || 0),
        wash_amount: skipCharges ? 0 : Number(intakeForm.wash_amount || 0),
        notes: skipCharges ? "" : intakeForm.notes,
      };
      await api.post(`/bookings/${intakeBooking.id}/handover-intake`, payload);
      if (!skipCharges && (payload.fuel_amount > 0 || payload.wash_amount > 0)) {
        toast.success("Car received & handover charges recorded against owner");
      } else {
        toast.success("Status updated to Car received");
      }
      setIntakeModalOpen(false);
      setIntakeBooking(null);
      await load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed to update intake");
    } finally {
      setSavingIntake(false);
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

  const downloadReport = async (kind) => {
    try {
      const url = `${API}/reports/monthly.${kind}?month=all`;
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
      a.download = `car-castle-goa-bookings-master.${kind}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success(`${kind.toUpperCase()} report exported successfully!`);
    } catch (e) {
      toast.error(e.message || "Failed to export report");
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
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          {!isOp && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadReport("xlsx")}
                className="bg-white border-[#C3E7F1] text-emerald-800 hover:bg-emerald-50 text-[11px] sm:text-xs font-semibold h-8 sm:h-9 px-2 sm:px-3 shadow-xs"
                title="Download live Excel master"
              >
                <Table2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 text-emerald-600 shrink-0" />
                <span className="hidden sm:inline">Export Excel</span>
                <span className="sm:hidden">Excel</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadReport("pdf")}
                className="bg-white border-[#C3E7F1] text-red-800 hover:bg-red-50 text-[11px] sm:text-xs font-semibold h-8 sm:h-9 px-2 sm:px-3 shadow-xs"
                title="Download live PDF report"
              >
                <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 text-red-600 shrink-0" />
                <span className="hidden sm:inline">Export PDF</span>
                <span className="sm:hidden">PDF</span>
              </Button>
            </>
          )}
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditing(null); setForm(empty); } }}>
            <DialogTrigger asChild>
              <Button className="bg-[#20373B] hover:bg-[#2C494E] text-[#FFC64F] font-bold shadow-xs h-8 sm:h-9 px-2.5 sm:px-4 text-[11px] sm:text-xs" data-testid="new-booking-button">
                <Plus className="w-3.5 h-3.5 mr-1 shrink-0" />
                <span className="hidden sm:inline">New booking</span>
                <span className="sm:hidden">New</span>
              </Button>
            </DialogTrigger>
          <DialogContent className="w-[96vw] sm:max-w-2xl max-h-[90dvh] overflow-y-auto p-4 sm:p-6 rounded-2xl">
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
              {/* Vehicle & Owner Selection */}
              <div className="sm:col-span-2 space-y-2.5 border border-[#C3E7F1] rounded-xl p-3 bg-[#F4FAFC]">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <Label className="text-xs font-bold text-[#20373B]">Vehicle & Owner Selection</Label>
                  <div className="flex bg-slate-200/80 p-0.5 rounded-lg text-xs font-semibold self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, car_selection_mode: "fleet" })}
                      className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                        form.car_selection_mode !== "direct"
                          ? "bg-white text-[#20373B] shadow-xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      🚗 Fleet Car
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, car_selection_mode: "direct", car_id: "" })}
                      className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                        form.car_selection_mode === "direct"
                          ? "bg-[#20373B] text-[#FFC64F] shadow-xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      ⚡ Direct Owner (Plate TBD)
                    </button>
                  </div>
                </div>

                {form.car_selection_mode !== "direct" ? (
                  <div>
                    <Label className="text-xs font-medium text-slate-600 mb-1 block">Select Registered Car</Label>
                    <Select value={form.car_id} onValueChange={(v) => {
                      const c = cars.find((x) => x.id === v);
                      const rate = c?.default_cost_rate ? String(c.default_cost_rate) : form.daily_cost_rate;
                      const totalCost = rate ? String(Number(rate) * days) : form.cost_rate;
                      setForm({ ...form, car_id: v, daily_cost_rate: rate, cost_rate: totalCost, car_model: c?.model || "", car_registration: c?.registration_no || "" });
                    }}>
                      <SelectTrigger data-testid="booking-car-select"><SelectValue placeholder="Select car from fleet" /></SelectTrigger>
                      <SelectContent>
                        {cars.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.model} · {c.registration_no} ({c.owner_name})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <Label className="text-xs font-medium text-slate-600 mb-1 block">Owner</Label>
                      {owners.length > 0 ? (
                        <div className="space-y-1.5">
                          <Select value={form.owner_id || "custom"} onValueChange={(v) => {
                            if (v === "custom") {
                              setForm({ ...form, owner_id: "", owner_name: "", owner_contact: "" });
                            } else {
                              const o = owners.find((x) => x.id === v);
                              setForm({ ...form, owner_id: v, owner_name: o?.name || "", owner_contact: o?.contact || "" });
                            }
                          }}>
                            <SelectTrigger><SelectValue placeholder="Select Owner or New" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="custom">+ Type New Owner Name</SelectItem>
                              {owners.map((o) => (
                                <SelectItem key={o.id} value={o.id}>{o.name} ({o.contact})</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {!form.owner_id && (
                            <Input
                              placeholder="Owner Name (e.g. Sanjay Kamat)"
                              value={form.owner_name}
                              onChange={(e) => setForm({ ...form, owner_name: e.target.value })}
                              className="mt-1 text-xs bg-white"
                            />
                          )}
                        </div>
                      ) : (
                        <Input
                          placeholder="Owner Name (e.g. Sanjay Kamat)"
                          value={form.owner_name}
                          onChange={(e) => setForm({ ...form, owner_name: e.target.value })}
                          className="text-xs bg-white"
                        />
                      )}
                    </div>

                    <div>
                      <Label className="text-xs font-medium text-slate-600 mb-1 block">Car Name / Model</Label>
                      <Input
                        placeholder="e.g. Swift, Ertiga, Thar, Innova"
                        value={form.car_model}
                        onChange={(e) => setForm({ ...form, car_model: e.target.value })}
                        className="text-xs bg-white"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <Label className="text-xs font-medium text-slate-600 mb-1 block">Owner Serial No / Contact</Label>
                      <Input
                        placeholder="Owner Phone / Serial No (e.g. +91 98765 43210)"
                        value={form.owner_contact}
                        onChange={(e) => setForm({ ...form, owner_contact: e.target.value, car_registration: form.car_registration || "TBD" })}
                        className="text-xs bg-white"
                      />
                    </div>
                  </div>
                )}
              </div>

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
                      ⚡ Drop after 9:30 AM (+1 day charged)
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
                <Select
                  value={form.transfer_type}
                  onValueChange={(v) => {
                    const defaultCost = v === "both" ? "2000" : (v === "none" ? "0" : "1000");
                    setForm({
                      ...form,
                      transfer_type: v,
                      transfer_cost: defaultCost,
                      transfer_manoj_share: form.transfer_handled_by === "self" ? defaultCost : String(Math.max(0, Number(defaultCost) - Number(form.transfer_driver_share || 0))),
                    });
                  }}
                >
                  <SelectTrigger data-testid="booking-transfer-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No transfer</SelectItem>
                    <SelectItem value="airport_pickup">Airport pickup</SelectItem>
                    <SelectItem value="airport_drop">Airport drop</SelectItem>
                    <SelectItem value="both">Both (Pickup & Drop)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              {form.transfer_type !== "none" && (
                <div className="sm:col-span-2 p-3.5 bg-[#F4FAFC] border border-[#C3E7F1] rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-[#20373B] flex items-center gap-1.5">
                      <Plane className="w-4 h-4 text-[#519CAB]" /> Airport Transfer Duty & Cut Setup
                    </span>
                    <span className="text-[11px] font-bold text-slate-500 font-tabular">
                      Rate: ₹{form.transfer_cost || (form.transfer_type === "both" ? "2000" : "1000")}
                    </span>
                  </div>

                  {/* Who Handles Transfer */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-[#20373B]">Who handles the airport duty?</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const cost = form.transfer_cost || (form.transfer_type === "both" ? "2000" : "1000");
                          setForm({
                            ...form,
                            transfer_handled_by: "self",
                            driver_name: "Owner (Self)",
                            transfer_driver_share: "0",
                            transfer_manoj_share: cost,
                            transfer_driver_paid: true,
                          });
                        }}
                        className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                          form.transfer_handled_by !== "driver"
                            ? "bg-emerald-50 border-emerald-500 text-emerald-950 font-bold shadow-xs ring-1 ring-emerald-400"
                            : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        <div className="text-xs font-bold flex items-center gap-1">
                          <User className="w-3.5 h-3.5 text-emerald-600" /> Owner (Self)
                        </div>
                        <div className="text-[10px] text-emerald-700 mt-0.5 font-medium">100% kept by owner · No driver cut</div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const tCost = Number(form.transfer_cost || (form.transfer_type === "both" ? 2000 : 1000));
                          const cut = 400;
                          setForm({
                            ...form,
                            transfer_handled_by: "driver",
                            driver_name: form.driver_name === "Owner (Self)" ? "" : form.driver_name,
                            transfer_driver_share: String(cut),
                            transfer_manoj_share: String(Math.max(0, tCost - cut)),
                            transfer_driver_paid: false,
                          });
                        }}
                        className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                          form.transfer_handled_by === "driver"
                            ? "bg-blue-50 border-blue-500 text-blue-950 font-bold shadow-xs ring-1 ring-blue-400"
                            : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        <div className="text-xs font-bold flex items-center gap-1">
                          <Car className="w-3.5 h-3.5 text-blue-600" /> Send Driver on Cut
                        </div>
                        <div className="text-[10px] text-blue-700 mt-0.5 font-medium">Custom cut to driver · Rest to owner</div>
                      </button>
                    </div>
                  </div>

                  {form.transfer_handled_by === "driver" && (
                    <div className="p-2.5 bg-white border border-blue-200 rounded-lg space-y-2.5 text-xs">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[11px] font-semibold text-slate-700">Driver / Person Name</Label>
                          <Input
                            value={form.driver_name === "Owner (Self)" ? "" : form.driver_name}
                            onChange={(e) => setForm({ ...form, driver_name: e.target.value })}
                            placeholder="e.g. Suresh / Deepak"
                            className="h-8 text-xs"
                          />
                        </div>
                        <div>
                          <Label className="text-[11px] font-semibold text-slate-700">Driver WhatsApp / Phone</Label>
                          <Input
                            value={form.driver_contact || ""}
                            onChange={(e) => setForm({ ...form, driver_contact: e.target.value })}
                            placeholder="+91 98221..."
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[11px] font-semibold text-slate-700">Agreed Driver Cut (₹)</Label>
                          <Input
                            type="number"
                            value={form.transfer_driver_share}
                            onChange={(e) => {
                              const cut = Number(e.target.value || 0);
                              const tCost = Number(form.transfer_cost || 1000);
                              setForm({
                                ...form,
                                transfer_driver_share: e.target.value,
                                transfer_manoj_share: String(Math.max(0, tCost - cut)),
                              });
                            }}
                            placeholder="e.g. 400"
                            className="h-8 text-xs font-bold font-tabular text-amber-900"
                          />
                        </div>
                        <div>
                          <Label className="text-[11px] font-semibold text-slate-700">Manoj / Owner Retains (₹)</Label>
                          <div className="h-8 flex items-center px-2 font-bold font-tabular text-emerald-900 bg-emerald-50 rounded border border-emerald-100">
                            {formatInr(form.transfer_manoj_share || 0)}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Flight & Pickup Point */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[11px] font-semibold text-slate-700">Flight details / Time</Label>
                      <Input
                        value={form.flight_time}
                        onChange={(e) => setForm({ ...form, flight_time: e.target.value })}
                        placeholder="e.g. 18:30 6E-204"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-[11px] font-semibold text-slate-700">Terminal / Pickup point</Label>
                      <Input
                        value={form.transfer_pickup_point}
                        onChange={(e) => setForm({ ...form, transfer_pickup_point: e.target.value })}
                        placeholder="e.g. MOPA Airport T1"
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                </div>
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
        </div>
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
                    {!b.car_registration || b.car_registration === "TBD" || b.car_registration === "—" ? (
                      <button
                        type="button"
                        onClick={() => {
                          setAssignTargetBooking(b);
                          setAssignPlateInput("");
                          setAssignCarModelInput(b.car_model && b.car_model !== "—" ? b.car_model : "");
                          setAssignModalOpen(true);
                        }}
                        className="inline-block px-2 py-0.5 rounded-md bg-amber-100 border border-amber-300 text-[10px] font-bold text-amber-900 shadow-xs hover:bg-amber-200"
                      >
                        ⚠️ Plate TBD · Assign
                      </button>
                    ) : (
                      <span className="inline-block px-2 py-0.5 rounded-md bg-[#F4FAFC] border border-[#C3E7F1] text-[11px] font-mono font-bold text-[#20373B]">
                        {b.car_registration}
                      </span>
                    )}
                    <div className="text-[11px] text-slate-500 font-medium">{b.car_model}</div>
                    <div className="text-[10px] text-slate-400">Owner: {b.owner_name || "—"}</div>
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
                <div className="flex items-center justify-end gap-2 pt-1 flex-wrap">
                  {(!b.car_registration || b.car_registration === "TBD" || b.car_registration === "—") && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setAssignTargetBooking(b);
                        setAssignPlateInput("");
                        setAssignCarModelInput(b.car_model && b.car_model !== "—" ? b.car_model : "");
                        setAssignModalOpen(true);
                      }}
                      className="h-8 text-xs font-semibold text-amber-800 border-amber-300 bg-amber-50 hover:bg-amber-100"
                    >
                      Assign Plate
                    </Button>
                  )}
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
                <th className="text-left px-5 py-2.5 font-semibold">Car & Plate</th>
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
                            9:30AM+ rule
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-2.5">
                      <div className="font-medium text-slate-900">{b.customer_name}</div>
                      <div className="text-xs text-slate-500">{b.customer_contact}</div>
                    </td>
                    <td className="px-5 py-2.5">
                      <div className="text-slate-800 font-medium">{b.car_model || "Standard Vehicle"}</div>
                      {!b.car_registration || b.car_registration === "TBD" || b.car_registration === "—" ? (
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                            ⚠️ Plate TBD
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setAssignTargetBooking(b);
                              setAssignPlateInput("");
                              setAssignCarModelInput(b.car_model && b.car_model !== "—" ? b.car_model : "");
                              setAssignModalOpen(true);
                            }}
                            className="text-[10px] font-bold text-[#20373B] underline hover:text-[#519CAB]"
                          >
                            Assign Plate
                          </button>
                        </div>
                      ) : (
                        <div className="text-xs text-slate-500 font-mono">{b.car_registration}</div>
                      )}
                      <div className="text-[11px] text-slate-400">Owner: {b.owner_name || "—"}</div>
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
                    <td className="px-5 py-2.5 text-right font-tabular font-bold text-slate-900">
                      {formatInr(b.customer_rate)}
                      {bDays > 1 && <div className="text-[10px] text-slate-400 font-normal">₹{Math.round(dCust)}/day</div>}
                    </td>
                    {!isOp && (
                      <td className="px-5 py-2.5 text-right font-tabular font-extrabold text-emerald-700">
                        {formatInr(b.margin)}
                      </td>
                    )}
                    <td className="px-5 py-2.5 text-right space-x-1 whitespace-nowrap">
                      {(!b.car_registration || b.car_registration === "TBD" || b.car_registration === "—") && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setAssignTargetBooking(b);
                            setAssignPlateInput("");
                            setAssignCarModelInput(b.car_model && b.car_model !== "—" ? b.car_model : "");
                            setAssignModalOpen(true);
                          }}
                          className="h-7 text-[11px] font-semibold text-amber-800 border-amber-300 bg-amber-50 hover:bg-amber-100"
                        >
                          Assign Plate
                        </Button>
                      )}
                      {depAmt > 0 && b.deposit_status === "received" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => refundDeposit(b)}
                          className="text-emerald-700 hover:text-emerald-800 text-xs"
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

      {/* 🚀 Quick Assign Vehicle Plate Modal */}
      <Dialog open={assignModalOpen} onOpenChange={setAssignModalOpen}>
        <DialogContent className="w-[96vw] sm:max-w-md max-h-[90dvh] overflow-y-auto p-4 sm:p-6 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-[#20373B] font-bold">Assign Vehicle Plate / Car</DialogTitle>
          </DialogHeader>
          {assignTargetBooking && (
            <div className="space-y-3 py-2">
              <div className="p-3 bg-[#F4FAFC] border border-[#C3E7F1] rounded-xl text-xs space-y-1">
                <div className="font-bold text-[#20373B] text-sm">{assignTargetBooking.customer_name}</div>
                <div className="text-slate-600">Owner: <span className="font-semibold text-slate-800">{assignTargetBooking.owner_name || "—"}</span></div>
                <div className="text-slate-500">Rental: {formatDate(assignTargetBooking.start_date)} → {formatDate(assignTargetBooking.end_date)}</div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Vehicle Registration / Plate Number</Label>
                <Input
                  placeholder="e.g. GA-03-W-1234"
                  value={assignPlateInput}
                  onChange={(e) => setAssignPlateInput(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Car Model / Name</Label>
                <Input
                  placeholder="e.g. Swift, Ertiga, Thar"
                  value={assignCarModelInput}
                  onChange={(e) => setAssignCarModelInput(e.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignModalOpen(false)}>Cancel</Button>
            <Button
              onClick={saveAssignedPlate}
              disabled={assigningPlate}
              className="bg-[#20373B] text-[#FFC64F] font-bold hover:bg-[#2C494E]"
            >
              {assigningPlate ? "Saving..." : "Save Plate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Car Handover Intake Dialog */}
      <Dialog open={intakeModalOpen} onOpenChange={setIntakeModalOpen}>
        <DialogContent className="w-[96vw] sm:max-w-md max-h-[90dvh] overflow-y-auto p-4 sm:p-6 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#20373B] font-bold text-lg">
              <Fuel className="w-5 h-5 text-amber-600" />
              Car Handover Intake ({intakeBooking?.car_registration || "Vehicle"})
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <div className="p-3 bg-amber-50/90 border border-amber-200 rounded-lg text-amber-950 leading-relaxed">
              Taking vehicle <strong>{intakeBooking?.car_model}</strong> ({intakeBooking?.car_registration}) from <strong>{intakeBooking?.owner_name || "Car Owner"}</strong>.
              <br />
              Did you pay any <strong>extra fuel</strong> or <strong>car washing</strong> charges out-of-pocket?
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Extra Fuel Paid by You (₹)</Label>
              <Input
                type="number"
                value={intakeForm.fuel_amount}
                onChange={(e) => setIntakeForm({ ...intakeForm, fuel_amount: e.target.value })}
                placeholder="0 (e.g. 500)"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Washing / Cleaning Paid by You (₹)</Label>
              <Input
                type="number"
                value={intakeForm.wash_amount}
                onChange={(e) => setIntakeForm({ ...intakeForm, wash_amount: e.target.value })}
                placeholder="0 (e.g. 300)"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Notes / Receipt Reason (Optional)</Label>
              <Input
                value={intakeForm.notes}
                onChange={(e) => setIntakeForm({ ...intakeForm, notes: e.target.value })}
                placeholder="e.g. Low fuel at delivery, foam washed at Calangute"
                className="h-9"
              />
            </div>
          </div>
          <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:justify-between">
            <Button
              variant="outline"
              onClick={() => submitHandoverIntake(true)}
              disabled={savingIntake}
              className="text-slate-600 border-slate-300 hover:bg-slate-50 text-xs font-semibold"
            >
              No Extra Charges (Skip)
            </Button>
            <Button
              onClick={() => submitHandoverIntake(false)}
              disabled={savingIntake}
              className="bg-[#20373B] hover:bg-[#2C494E] text-[#FFC64F] font-bold text-xs"
            >
              {savingIntake ? "Saving…" : "Save Charges & Receive Car"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

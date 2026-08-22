import React, { useEffect, useState } from "react";
import AppLayout from "@/components/AppLayout";
import StatusPill from "@/components/StatusPill";
import { api, formatInr, formatDate, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plane, ChevronRight, User, Edit3, IndianRupee, Car, CheckCircle2, Clock, HelpCircle, Users, Calendar, Plus } from "lucide-react";

const stages = [
  { id: "scheduled", label: "Scheduled" },
  { id: "en_route", label: "En route" },
  { id: "completed", label: "Completed" },
];

const newTransferEmpty = {
  customer_name: "",
  customer_contact: "",
  car_id: "",
  start_date: new Date().toISOString().slice(0, 10),
  end_date: new Date().toISOString().slice(0, 10),
  pickup_location: "MOPA Airport",
  drop_location: "Panjim, Goa",
  transfer_type: "airport_drop",
  flight_time: "14:30 AI-671",
  transfer_pickup_point: "MOPA Airport Terminal 1",
  driver_name: "Owner (Self)",
  driver_fee: "500",
  driver_fee_paid: "0",
  customer_rate: "1500",
  cost_rate: "1000",
  notes: "",
};

export default function TransfersPage() {
  const { user } = useAuth();
  const isOp = user?.role === "operator";
  const [activeTab, setActiveTab] = useState("kanban");
  const [rows, setRows] = useState([]);
  const [summaryData, setSummaryData] = useState({ summary: {}, drivers: [] });
  const [carsList, setCarsList] = useState([]);

  // New Transfer Modal State
  const [newOpen, setNewOpen] = useState(false);
  const [newForm, setNewForm] = useState(newTransferEmpty);

  // Edit Modal State
  const [editOpen, setEditOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [form, setForm] = useState({
    driver_name: "Owner (Self)",
    driver_fee: "0",
    driver_fee_paid: "0",
    transfer_status: "scheduled",
    transfer_type: "airport_drop",
    flight_time: "",
    transfer_pickup_point: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const [{ data: tData }, { data: sData }, { data: cData }] = await Promise.all([
        api.get("/transfers"),
        api.get("/transfers/drivers-summary"),
        api.get("/cars"),
      ]);
      setRows(tData);
      setSummaryData(sData);
      setCarsList(cData);
      if (cData.length > 0 && !newForm.car_id) {
        setNewForm((prev) => ({ ...prev, car_id: cData[0].id }));
      }
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed to load transfers");
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line

  const createTransfer = async () => {
    if (!newForm.customer_name || !newForm.car_id) {
      toast.error("Please enter customer name and select a car");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        customer_name: newForm.customer_name,
        customer_contact: newForm.customer_contact || "N/A",
        car_id: newForm.car_id,
        start_date: newForm.start_date,
        end_date: newForm.end_date || newForm.start_date,
        pickup_location: newForm.pickup_location || "Airport",
        drop_location: newForm.drop_location || "Hotel",
        transfer_type: newForm.transfer_type,
        flight_time: newForm.flight_time,
        transfer_pickup_point: newForm.transfer_pickup_point,
        driver_name: newForm.driver_name || "Owner (Self)",
        driver_fee: Number(newForm.driver_fee || 0),
        driver_fee_paid: Number(newForm.driver_fee_paid || 0),
        customer_rate: Number(newForm.customer_rate || 0),
        cost_rate: Number(newForm.cost_rate || 0),
        notes: newForm.notes,
      };

      await api.post("/bookings", payload);
      toast.success("New Airport Transfer scheduled successfully");
      setNewOpen(false);
      setNewForm(newTransferEmpty);
      await load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (b) => {
    setSelectedBooking(b);
    setForm({
      driver_name: b.driver_name || "Owner (Self)",
      driver_fee: String(b.driver_fee || 0),
      driver_fee_paid: String(b.driver_fee_paid || 0),
      transfer_status: b.transfer_status || "scheduled",
      transfer_type: b.transfer_type || "airport_drop",
      flight_time: b.flight_time || "",
      transfer_pickup_point: b.transfer_pickup_point || "",
      notes: b.notes || "",
    });
    setEditOpen(true);
  };

  const saveDriverUpdate = async () => {
    if (!selectedBooking) return;
    setSaving(true);
    try {
      await api.put(`/transfers/${selectedBooking.id}/driver`, {
        driver_name: form.driver_name,
        driver_fee: Number(form.driver_fee),
        driver_fee_paid: Number(form.driver_fee_paid),
        transfer_status: form.transfer_status,
        transfer_type: form.transfer_type,
        flight_time: form.flight_time,
        transfer_pickup_point: form.transfer_pickup_point,
        notes: form.notes,
      });
      toast.success("Transfer & Driver details updated");
      setEditOpen(false);
      await load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (id, s) => {
    try {
      await api.put(`/transfers/${id}/status`, { status: s });
      toast.success(`Transfer → ${s.replace("_", " ")}`);
      await load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  };

  const grouped = {
    scheduled: rows.filter((r) => r.transfer_status === "scheduled"),
    en_route: rows.filter((r) => r.transfer_status === "en_route"),
    completed: rows.filter((r) => r.transfer_status === "completed"),
  };

  const totalDriverFees = rows.reduce((acc, r) => acc + Number(r.driver_fee || 0), 0);
  const totalDriverPaid = rows.reduce((acc, r) => acc + Number(r.driver_fee_paid || 0), 0);
  const totalDriverPending = totalDriverFees - totalDriverPaid;

  return (
    <AppLayout
      title="Airport Transfers & Driver Payouts"
      subtitle="Track car drops/pickups, driver fees, payment settlements & monthly driver summaries."
      actions={
        <Button
          onClick={() => setNewOpen(true)}
          className="bg-[#20373B] hover:bg-[#2C494E] shadow-md text-[#FFC64F] font-bold border border-[#2C494E]"
          data-testid="add-transfer-button"
        >
          <Plus className="w-4 h-4 mr-1.5 text-[#FFC64F]" /> Add New Airport Transfer
        </Button>
      }
    >
      {/* Informative Explanation Banner */}
      <div className="mb-6 p-5 rounded-xl bg-[#20373B] text-white shadow-lg border border-[#2C494E] flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-lg bg-[#FFC64F] text-[#20373B] flex items-center justify-center shrink-0 shadow-md mt-0.5 font-bold">
            <Plane className="w-5 h-5" strokeWidth={2.5} />
          </div>
          <div>
            <h3 className="font-display font-bold text-white flex items-center gap-2 text-base">
              Driver & Transfer Management
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#519CAB]/30 text-[#FFC64F] font-medium border border-[#519CAB]/40">
                Owner vs. External Drivers
              </span>
            </h3>
            <p className="text-xs text-[#C3E7F1] mt-1 max-w-3xl leading-relaxed">
              Log who drops or picks up each car (e.g. <strong>Owner (Self)</strong> or a hired driver like <strong>Suresh</strong>). Set the agreed drop amount, track payments made, and monitor monthly driver payout statements.
            </p>
          </div>
        </div>
        <div className="text-xs font-medium text-[#C3E7F1] flex items-center gap-1.5 bg-[#16272A]/80 px-3 py-1.5 rounded-lg border border-[#2C494E] shrink-0">
          <HelpCircle className="w-4 h-4 text-[#FFC64F]" />
          <span>Fully Editable Driver Fees</span>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <TabsList className="bg-[#C3E7F1]/30 border border-[#C3E7F1]">
            <TabsTrigger value="kanban" className="data-[state=active]:bg-white data-[state=active]:text-[#20373B] font-semibold">
              <Plane className="w-4 h-4 mr-1.5 text-[#519CAB]" /> Transfer Pipeline
            </TabsTrigger>
            <TabsTrigger value="drivers" className="data-[state=active]:bg-white data-[state=active]:text-[#20373B] font-semibold">
              <Users className="w-4 h-4 mr-1.5 text-[#519CAB]" /> Driver Payout Summary
            </TabsTrigger>
          </TabsList>

          {/* Quick Metrics */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-4 bg-white border border-slate-200 rounded-lg p-2.5 sm:px-4 sm:py-2 text-xs shadow-xs">
            <div>
              <span className="text-slate-400 font-medium">Decided Fees:</span>{" "}
              <span className="font-semibold font-tabular text-slate-900">{formatInr(totalDriverFees)}</span>
            </div>
            <div className="h-3 w-px bg-slate-200 hidden sm:block" />
            <div>
              <span className="text-slate-400 font-medium">Driver Paid:</span>{" "}
              <span className="font-semibold font-tabular text-emerald-600">{formatInr(totalDriverPaid)}</span>
            </div>
            <div className="h-3 w-px bg-slate-200 hidden sm:block" />
            <div>
              <span className="text-slate-400 font-medium">Driver Pending:</span>{" "}
              <span className={`font-semibold font-tabular ${totalDriverPending > 0 ? "text-red-600" : "text-slate-500"}`}>
                {formatInr(totalDriverPending)}
              </span>
            </div>
          </div>
        </div>

        {/* TAB 1: KANBAN PIPELINE */}
        <TabsContent value="kanban" className="mt-0">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-testid="transfers-kanban">
            {stages.map((s) => (
              <div key={s.id} className="bg-slate-100/70 border border-slate-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${s.id === "scheduled" ? "bg-sky-500" : s.id === "en_route" ? "bg-amber-500" : "bg-emerald-500"}`} />
                    <div className="font-display font-semibold text-slate-900 text-sm uppercase tracking-wider">{s.label}</div>
                  </div>
                  <span className="text-xs bg-white px-2 py-0.5 rounded-full text-slate-600 font-semibold font-tabular border border-slate-200">
                    {grouped[s.id].length}
                  </span>
                </div>

                <div className="space-y-3" data-testid={`transfer-column-${s.id}`}>
                  {grouped[s.id].map((b) => {
                    const fee = Number(b.driver_fee || 0);
                    const paid = Number(b.driver_fee_paid || 0);
                    const pending = Math.max(0, fee - paid);
                    const isSelf = (b.driver_name || "Owner (Self)").toLowerCase().includes("owner");

                    return (
                      <Card
                        key={b.id}
                        className="p-4 bg-white border border-[#C3E7F1] hover:border-[#519CAB] hover:shadow-md transition-all relative group rounded-xl"
                        data-testid={`transfer-card-${b.id}`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <StatusPill status={b.transfer_type} />
                          <span className="text-[10px] text-[#20373B]/70 font-mono flex items-center gap-1 bg-[#F4FAFC] px-2 py-0.5 rounded border border-[#C3E7F1]">
                            <Calendar className="w-3 h-3 text-[#519CAB]" /> {formatDate(b.start_date)}
                          </span>
                        </div>

                        {/* Customer & Location */}
                        <div className="font-bold text-[#20373B] text-sm">{b.customer_name}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{b.customer_contact}</div>
                        
                        <div className="text-xs text-[#20373B] mt-2 flex items-center gap-1.5 bg-[#F4FAFC] p-2 rounded-lg border border-[#C3E7F1]">
                          <Plane className="w-3.5 h-3.5 text-[#519CAB] shrink-0" />
                          <span className="font-semibold">{b.flight_time || "Time N/A"}</span> · <span className="truncate">{b.transfer_pickup_point || b.pickup_location}</span>
                        </div>

                        {/* Car Details */}
                        <div className="text-xs text-slate-600 mt-2 flex items-center gap-1.5">
                          <Car className="w-3.5 h-3.5 text-slate-400" />
                          <span>{b.car_model}</span>
                          <span className="font-mono text-[11px] bg-[#C3E7F1]/30 px-1.5 py-0.5 rounded text-[#20373B]">{b.car_registration}</span>
                        </div>

                        {/* Driver & Financials Box */}
                        <div className="mt-3 pt-3 border-t border-[#C3E7F1]/60">
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1 text-[#20373B]">
                              <User className="w-3.5 h-3.5 text-[#519CAB]" />
                              <span className="font-semibold">{b.driver_name || "Owner (Self)"}</span>
                              {isSelf && <span className="text-[10px] text-slate-400 bg-slate-100 px-1 rounded">(Self)</span>}
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEdit(b)}
                              className="h-6 px-2 text-[11px] text-[#519CAB] hover:bg-[#C3E7F1]/30 hover:text-[#20373B] font-semibold"
                            >
                              <Edit3 className="w-3 h-3 mr-1" /> Edit Driver
                            </Button>
                          </div>

                          {/* Fee breakdown */}
                          {fee > 0 ? (
                            <div className="mt-2 grid grid-cols-3 gap-1 bg-slate-50 p-2 rounded-lg text-center text-[11px]">
                              <div>
                                <span className="text-slate-400 block text-[9px] uppercase font-semibold">Decided Fee</span>
                                <span className="font-tabular font-semibold text-slate-800">{formatInr(fee)}</span>
                              </div>
                              <div>
                                <span className="text-slate-400 block text-[9px] uppercase font-semibold">Paid</span>
                                <span className="font-tabular font-semibold text-emerald-600">{formatInr(paid)}</span>
                              </div>
                              <div>
                                <span className="text-slate-400 block text-[9px] uppercase font-semibold">Pending</span>
                                <span className={`font-tabular font-semibold ${pending > 0 ? "text-red-600" : "text-slate-500"}`}>
                                  {formatInr(pending)}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="mt-1.5 text-[11px] text-slate-400 italic">No driver fee specified</div>
                          )}
                        </div>

                        {/* Action buttons to change stage */}
                        <div className="flex gap-1.5 mt-3 pt-2 border-t border-slate-100">
                          {stages.filter((x) => x.id !== s.id).map((x) => (
                            <Button
                              key={x.id}
                              variant="outline"
                              size="sm"
                              className="h-7 text-[11px] flex-1 bg-slate-50 hover:bg-white"
                              onClick={() => setStatus(b.id, x.id)}
                              data-testid={`transfer-move-${b.id}-${x.id}`}
                            >
                              <ChevronRight className="w-3 h-3" /> {x.label}
                            </Button>
                          ))}
                        </div>
                      </Card>
                    );
                  })}

                  {grouped[s.id].length === 0 && (
                    <div className="text-center text-xs text-slate-400 py-8 bg-white/50 rounded-lg border border-dashed border-slate-200">
                      No {s.label.toLowerCase()} transfers
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* TAB 2: MONTHLY DRIVER SUMMARY LEDGER */}
        <TabsContent value="drivers" className="mt-0">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <h3 className="font-display font-semibold text-slate-900 text-sm">Monthly Driver Payout Ledger</h3>
                <p className="text-xs text-slate-500 mt-0.5">Aggregated fees, payments, and pending balances grouped by driver/person.</p>
              </div>
              <div className="text-xs text-slate-500 font-semibold font-tabular">
                {summaryData.drivers.length} Driver(s) Registered
              </div>
            </div>

            <table className="w-full text-sm">
              <thead className="bg-slate-100/70 text-[11px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="text-left px-5 py-3 font-semibold">Driver / Person Name</th>
                  <th className="text-center px-5 py-3 font-semibold">Transfers Handled</th>
                  <th className="text-right px-5 py-3 font-semibold">Total Decided Fee</th>
                  <th className="text-right px-5 py-3 font-semibold">Total Paid Amount</th>
                  <th className="text-right px-5 py-3 font-semibold">Pending Balance</th>
                  <th className="text-center px-5 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summaryData.drivers.map((d) => {
                  const isSelf = d.driver_name.toLowerCase().includes("owner");
                  return (
                    <tr key={d.driver_name} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-5 py-3.5 font-semibold text-slate-900 flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-[#C3E7F1]/30 border border-[#C3E7F1] text-[#20373B] flex items-center justify-center text-xs font-bold">
                          {d.driver_name.charAt(0)}
                        </div>
                        <div>
                          <div>{d.driver_name}</div>
                          {isSelf && <span className="text-[10px] text-slate-400 font-normal">Vehicle Owner Self-Drop</span>}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-center font-tabular font-medium text-slate-700">{d.total_transfers}</td>
                      <td className="px-5 py-3.5 text-right font-tabular font-semibold text-slate-900">{formatInr(d.total_fee)}</td>
                      <td className="px-5 py-3.5 text-right font-tabular font-semibold text-emerald-600">{formatInr(d.total_paid)}</td>
                      <td className={`px-5 py-3.5 text-right font-tabular font-semibold ${d.total_pending > 0 ? "text-red-600" : "text-slate-500"}`}>
                        {formatInr(d.total_pending)}
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        {d.total_pending > 0 ? (
                          <span className="text-xs px-2.5 py-1 rounded-full bg-red-50 text-red-700 border border-red-200 font-medium inline-flex items-center gap-1">
                            <Clock className="w-3 h-3" /> Pending ₹{d.total_pending}
                          </span>
                        ) : (
                          <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Fully Settled
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {summaryData.drivers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center text-slate-500">
                      No driver transfer records available.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      {/* CREATE NEW AIRPORT TRANSFER MODAL */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="w-[95vw] sm:max-w-lg max-h-[88vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#20373B] text-lg font-bold">
              <div className="w-8 h-8 rounded-full bg-[#C3E7F1] flex items-center justify-center text-[#20373B]">
                <Plane className="w-4 h-4" />
              </div>
              Add New Airport Transfer
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2 text-sm">
            {/* Customer info */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Customer Name</Label>
                <Input
                  value={newForm.customer_name}
                  onChange={(e) => setNewForm({ ...newForm, customer_name: e.target.value })}
                  placeholder="e.g. Vikram Sharma"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Contact Phone</Label>
                <Input
                  value={newForm.customer_contact}
                  onChange={(e) => setNewForm({ ...newForm, customer_contact: e.target.value })}
                  placeholder="+91 98765 43210"
                />
              </div>
            </div>

            {/* Select Car */}
            <div className="space-y-1.5">
              <Label>Select Vehicle / Car</Label>
              <Select
                value={newForm.car_id}
                onValueChange={(val) => setNewForm({ ...newForm, car_id: val })}
              >
                <SelectTrigger><SelectValue placeholder="Select a car..." /></SelectTrigger>
                <SelectContent>
                  {carsList.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.model} ({c.registration_no})
                    </SelectItem>
                  ))}
                  {carsList.length === 0 && (
                    <SelectItem value="none" disabled>No cars registered in system</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Transfer Type & Date */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Transfer Type</Label>
                <Select
                  value={newForm.transfer_type}
                  onValueChange={(val) => setNewForm({ ...newForm, transfer_type: val })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="airport_drop">Airport Drop</SelectItem>
                    <SelectItem value="airport_pickup">Airport Pickup</SelectItem>
                    <SelectItem value="both">Both Pickup & Drop</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Transfer Date</Label>
                <Input
                  type="date"
                  value={newForm.start_date}
                  onChange={(e) => setNewForm({ ...newForm, start_date: e.target.value, end_date: e.target.value })}
                />
              </div>
            </div>

            {/* Flight time & Pickup Point */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Flight Details / Time</Label>
                <Input
                  value={newForm.flight_time}
                  onChange={(e) => setNewForm({ ...newForm, flight_time: e.target.value })}
                  placeholder="e.g. 14:30 AI-671"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Airport Terminal / Point</Label>
                <Input
                  value={newForm.transfer_pickup_point}
                  onChange={(e) => setNewForm({ ...newForm, transfer_pickup_point: e.target.value })}
                  placeholder="e.g. MOPA Airport Terminal 1"
                />
              </div>
            </div>

            {/* Driver Name & Financials */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <div className="space-y-1.5">
                <Label className="text-slate-900 font-semibold">Who Drops/Picks Up the Car?</Label>
                <Input
                  value={newForm.driver_name}
                  onChange={(e) => setNewForm({ ...newForm, driver_name: e.target.value })}
                  placeholder="e.g. Owner (Self) or Driver Suresh"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Decided Driver Fee (₹)</Label>
                  <Input
                    type="number"
                    value={newForm.driver_fee}
                    onChange={(e) => setNewForm({ ...newForm, driver_fee: e.target.value })}
                    placeholder="500"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Amount Paid to Driver (₹)</Label>
                  <Input
                    type="number"
                    value={newForm.driver_fee_paid}
                    onChange={(e) => setNewForm({ ...newForm, driver_fee_paid: e.target.value })}
                    placeholder="0"
                  />
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label>Notes (Optional)</Label>
              <Textarea
                value={newForm.notes}
                onChange={(e) => setNewForm({ ...newForm, notes: e.target.value })}
                placeholder="Special pickup instructions or payment notes..."
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>Cancel</Button>
            <Button onClick={createTransfer} disabled={saving} className="bg-[#20373B] hover:bg-[#2C494E] text-[#FFC64F] font-bold">
              {saving ? "Creating…" : "Save Transfer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* EDIT DRIVER & TRANSFER MODAL */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="w-[95vw] sm:max-w-md max-h-[88vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#20373B] text-lg font-bold">
              <div className="w-8 h-8 rounded-full bg-[#C3E7F1] flex items-center justify-center text-[#20373B]">
                <User className="w-4 h-4" />
              </div>
              Edit Driver & Transfer Details
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {selectedBooking && (
              <div className="p-3 bg-[#F4FAFC] border border-[#C3E7F1] rounded-lg text-xs space-y-1 text-slate-600">
                <div><strong>Customer:</strong> {selectedBooking.customer_name} ({selectedBooking.customer_contact})</div>
                <div><strong>Car:</strong> {selectedBooking.car_model} · <span className="font-mono">{selectedBooking.car_registration}</span></div>
              </div>
            )}

            {/* Driver Name */}
            <div className="space-y-1.5">
              <Label>Who Dropped / Picked up the Car?</Label>
              <Input
                value={form.driver_name}
                onChange={(e) => setForm({ ...form, driver_name: e.target.value })}
                placeholder="e.g. Owner (Self), Suresh Driver, Ramesh..."
              />
              <p className="text-[11px] text-slate-400">Type "Owner (Self)" if the car owner dropped it, or enter the driver's name.</p>
            </div>

            {/* Financials: Decided Fee vs Paid Amount */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Decided Fee (₹)</Label>
                <Input
                  type="number"
                  value={form.driver_fee}
                  onChange={(e) => setForm({ ...form, driver_fee: e.target.value })}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Amount Paid (₹)</Label>
                <Input
                  type="number"
                  value={form.driver_fee_paid}
                  onChange={(e) => setForm({ ...form, driver_fee_paid: e.target.value })}
                  placeholder="0"
                />
              </div>
            </div>

            {/* Calculated Pending */}
            <div className="p-2.5 bg-[#FFC64F]/20 border border-[#FFC64F]/50 rounded-lg flex items-center justify-between text-xs">
              <span className="font-bold text-[#20373B]">Calculated Pending Amount:</span>
              <span className="font-bold font-tabular text-sm text-red-600">
                {formatInr(Math.max(0, Number(form.driver_fee || 0) - Number(form.driver_fee_paid || 0)))}
              </span>
            </div>

            {/* Status & Flight info */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Transfer Pipeline Stage</Label>
                <Select
                  value={form.transfer_status}
                  onValueChange={(val) => setForm({ ...form, transfer_status: val })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="en_route">En Route</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Flight Time</Label>
                <Input
                  value={form.flight_time}
                  onChange={(e) => setForm({ ...form, flight_time: e.target.value })}
                  placeholder="e.g. 14:30 AI-671"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Pickup / Drop Location</Label>
              <Input
                value={form.transfer_pickup_point}
                onChange={(e) => setForm({ ...form, transfer_pickup_point: e.target.value })}
                placeholder="e.g. MOPA Airport Terminal 1"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Driver / Transfer Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="e.g. Driver paid ₹300 cash on spot, ₹200 UPI pending..."
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={saveDriverUpdate} disabled={saving} className="bg-[#20373B] hover:bg-[#2C494E] text-[#FFC64F] font-bold">
              {saving ? "Saving…" : "Save Driver Details"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

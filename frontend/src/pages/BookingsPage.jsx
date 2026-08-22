import React, { useEffect, useState } from "react";
import AppLayout from "@/components/AppLayout";
import StatusPill from "@/components/StatusPill";
import { api, formatInr, formatDate, formatApiError } from "@/lib/api";
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
import { Plus, Search } from "lucide-react";

const empty = {
  customer_name: "", customer_contact: "", customer_id_proof: "",
  car_id: "", start_date: "", end_date: "",
  pickup_location: "", drop_location: "",
  cost_rate: "", customer_rate: "",
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
    if (!q) return true;
    const s = q.toLowerCase();
    return (b.customer_name || "").toLowerCase().includes(s) ||
      (b.car_registration || "").toLowerCase().includes(s) ||
      (b.customer_contact || "").toLowerCase().includes(s);
  });

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        ...form,
        cost_rate: Number(form.cost_rate || 0),
        customer_rate: Number(form.customer_rate || 0),
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
    setForm({
      ...empty,
      customer_name: b.customer_name || "",
      customer_contact: b.customer_contact || "",
      customer_id_proof: b.customer_id_proof || "",
      car_id: b.car_id || "",
      start_date: (b.start_date || "").slice(0, 10),
      end_date: (b.end_date || "").slice(0, 10),
      pickup_location: b.pickup_location || "",
      drop_location: b.drop_location || "",
      cost_rate: b.cost_rate ?? "",
      customer_rate: b.customer_rate ?? "",
      transfer_type: b.transfer_type || "none",
      flight_time: b.flight_time || "",
      transfer_pickup_point: b.transfer_pickup_point || "",
      assigned_agent_id: b.assigned_agent_id || "",
      agent_fee: b.agent_fee ?? "0",
      notes: b.notes || "",
    });
    setOpen(true);
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
                <Input value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} data-testid="booking-customer-name" />
              </Field>
              <Field label="Customer contact">
                <Input value={form.customer_contact} onChange={(e) => setForm({ ...form, customer_contact: e.target.value })} data-testid="booking-customer-contact" />
              </Field>
              <Field label="ID proof">
                <Input value={form.customer_id_proof} onChange={(e) => setForm({ ...form, customer_id_proof: e.target.value })} placeholder="Aadhaar/DL last 4" />
              </Field>
              <Field label="Car">
                <Select value={form.car_id} onValueChange={(v) => {
                  const c = cars.find((x) => x.id === v);
                  setForm({ ...form, car_id: v, cost_rate: c?.default_cost_rate ?? form.cost_rate });
                }}>
                  <SelectTrigger data-testid="booking-car-select"><SelectValue placeholder="Select car" /></SelectTrigger>
                  <SelectContent>
                    {cars.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.model} · {c.registration_no}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Start date">
                <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} data-testid="booking-start-date" />
              </Field>
              <Field label="End date">
                <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} data-testid="booking-end-date" />
              </Field>
              <Field label="Pickup location">
                <Input value={form.pickup_location} onChange={(e) => setForm({ ...form, pickup_location: e.target.value })} />
              </Field>
              <Field label="Drop location">
                <Input value={form.drop_location} onChange={(e) => setForm({ ...form, drop_location: e.target.value })} />
              </Field>
              {!isOp && (
                <>
                  <Field label="Owner cost rate (₹, total)">
                    <Input type="number" value={form.cost_rate} onChange={(e) => setForm({ ...form, cost_rate: e.target.value })} data-testid="booking-cost-rate" />
                  </Field>
                  <Field label="Customer rate (₹, total)">
                    <Input type="number" value={form.customer_rate} onChange={(e) => setForm({ ...form, customer_rate: e.target.value })} data-testid="booking-customer-rate" />
                  </Field>
                </>
              )}
              {isOp && (
                <Field label="Customer rate (₹, total)">
                  <Input type="number" value={form.customer_rate} onChange={(e) => setForm({ ...form, customer_rate: e.target.value })} data-testid="booking-customer-rate" />
                </Field>
              )}
              <Field label="Airport transfer">
                <Select value={form.transfer_type} onValueChange={(v) => setForm({ ...form, transfer_type: v })}>
                  <SelectTrigger data-testid="booking-transfer-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No transfer</SelectItem>
                    <SelectItem value="airport_pickup">Airport pickup</SelectItem>
                    <SelectItem value="airport_drop">Airport drop</SelectItem>
                    <SelectItem value="both">Both</SelectItem>
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
              <div className="col-span-2">
                <Field label="Notes">
                  <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
                </Field>
              </div>
              {!isOp && form.customer_rate && form.cost_rate && (
                <div className="col-span-2 rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm">
                  Auto margin: <span className="font-semibold font-tabular">{formatInr(Number(form.customer_rate) - Number(form.cost_rate))}</span>
                  {form.agent_fee && Number(form.agent_fee) > 0 && (
                    <> · Net profit: <span className="font-semibold font-tabular">
                      {formatInr(Number(form.customer_rate) - Number(form.cost_rate) - Number(form.agent_fee))}
                    </span></>
                  )}
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
          {filtered.map((b) => (
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
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Rental Period</div>
                  <div className="font-semibold text-slate-800">
                    {formatDate(b.start_date)} → {formatDate(b.end_date)}
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

              {/* Financials Strip */}
              <div className="grid grid-cols-3 gap-2 text-center p-2 rounded-lg bg-[#20373B]/5 border border-[#C3E7F1]/50 text-xs">
                <div>
                  <div className="text-[9px] uppercase tracking-wider text-slate-500">Customer</div>
                  <div className="font-bold font-tabular text-[#20373B]">{formatInr(b.customer_rate)}</div>
                </div>
                {!isOp && (
                  <div>
                    <div className="text-[9px] uppercase tracking-wider text-slate-500">Car Cost</div>
                    <div className="font-semibold font-tabular text-red-700">{formatInr(b.cost_rate)}</div>
                  </div>
                )}
                {!isOp && (
                  <div>
                    <div className="text-[9px] uppercase tracking-wider text-slate-500">Margin</div>
                    <div className="font-bold font-tabular text-emerald-700">{formatInr(b.margin)}</div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-1">
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
          ))}
          {filtered.length === 0 && (
            <div className="p-8 text-center text-slate-500 text-sm">No bookings match your filters.</div>
          )}
        </div>

        {/* 💻 Desktop & Tablet Table View (hidden sm:block) */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-sm" data-testid="bookings-table">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="text-left px-5 py-2.5 font-semibold">Dates</th>
                <th className="text-left px-5 py-2.5 font-semibold">Customer</th>
                <th className="text-left px-5 py-2.5 font-semibold">Car</th>
                <th className="text-left px-5 py-2.5 font-semibold">Status</th>
                <th className="text-left px-5 py-2.5 font-semibold">Transfer</th>
                {!isOp && <th className="text-right px-5 py-2.5 font-semibold">Cost</th>}
                <th className="text-right px-5 py-2.5 font-semibold">Rate</th>
                {!isOp && <th className="text-right px-5 py-2.5 font-semibold">Margin</th>}
                <th className="text-right px-5 py-2.5 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((b) => (
                <tr key={b.id} className="dense-row" data-testid={`booking-row-${b.id}`}>
                  <td className="px-5 py-2.5 whitespace-nowrap">
                    <div>{formatDate(b.start_date)}</div>
                    <div className="text-xs text-slate-500">→ {formatDate(b.end_date)}</div>
                  </td>
                  <td className="px-5 py-2.5">
                    <div className="font-medium text-slate-900">{b.customer_name}</div>
                    <div className="text-xs text-slate-500">{b.customer_contact}</div>
                  </td>
                  <td className="px-5 py-2.5">
                    <div className="text-slate-700">{b.car_model}</div>
                    <div className="text-xs text-slate-500 font-mono">{b.car_registration}</div>
                  </td>
                  <td className="px-5 py-2.5">
                    <Select value={b.status} onValueChange={(v) => updateStatus(b, v)}>
                      <SelectTrigger className="w-36 h-8 text-xs" data-testid={`booking-status-${b.id}`}>
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
                  {!isOp && <td className="px-5 py-2.5 text-right font-tabular text-slate-700">{formatInr(b.cost_rate)}</td>}
                  <td className="px-5 py-2.5 text-right font-tabular font-medium">{formatInr(b.customer_rate)}</td>
                  {!isOp && <td className="px-5 py-2.5 text-right font-tabular text-emerald-700 font-semibold">{formatInr(b.margin)}</td>}
                  <td className="px-5 py-2.5 text-right whitespace-nowrap">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(b)} data-testid={`booking-edit-${b.id}`}>Edit</Button>
                    {!isOp && (
                      <Button variant="ghost" size="sm" onClick={() => del(b)} className="text-red-600 hover:text-red-700" data-testid={`booking-delete-${b.id}`}>Delete</Button>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={isOp ? 6 : 9} className="px-5 py-12 text-center text-slate-500">No bookings match your filters.</td></tr>
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

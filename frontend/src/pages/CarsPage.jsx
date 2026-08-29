import React, { useEffect, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { api, formatInr, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Calendar, Car as CarIcon } from "lucide-react";

export default function CarsPage() {
  const [rows, setRows] = useState([]);
  const [owners, setOwners] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    registration_no: "",
    model: "",
    owner_id: "",
    default_cost_rate: "",
    billing_type: "daily",
    monthly_cost_rate: "",
    billing_cycle_day: "1",
  });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [c, o] = await Promise.all([api.get("/cars"), api.get("/owners")]);
    setRows(c.data);
    setOwners(o.data);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        ...form,
        default_cost_rate: Number(form.default_cost_rate || 0),
        billing_type: form.billing_type || "daily",
        monthly_cost_rate: Number(form.monthly_cost_rate || 0),
        billing_cycle_day: Number(form.billing_cycle_day || 1),
      };
      if (editing) await api.put(`/cars/${editing.id}`, payload);
      else await api.post("/cars", payload);
      toast.success(editing ? "Car updated" : "Car added");
      setOpen(false);
      setEditing(null);
      setForm({
        registration_no: "", model: "", owner_id: "",
        default_cost_rate: "", billing_type: "daily",
        monthly_cost_rate: "", billing_cycle_day: "1"
      });
      await load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally { setSaving(false); }
  };

  const openEdit = (c) => {
    setEditing(c);
    setForm({
      registration_no: c.registration_no,
      model: c.model,
      owner_id: c.owner_id,
      default_cost_rate: c.default_cost_rate || "",
      billing_type: c.billing_type || "daily",
      monthly_cost_rate: c.monthly_cost_rate || "",
      billing_cycle_day: String(c.billing_cycle_day || "1"),
    });
    setOpen(true);
  };

  const del = async (c) => {
    if (!window.confirm(`Delete ${c.model} ${c.registration_no}?`)) return;
    try {
      await api.delete(`/cars/${c.id}`);
      toast.success("Car deleted");
      await load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  };

  return (
    <AppLayout
      title="Cars"
      subtitle={`${rows.length} vehicles in fleet`}
      actions={
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) {
              setEditing(null);
              setForm({
                registration_no: "", model: "", owner_id: "",
                default_cost_rate: "", billing_type: "daily",
                monthly_cost_rate: "", billing_cycle_day: "1"
              });
            }
          }}
        >
          <DialogTrigger asChild>
            <Button className="bg-[#20373B] hover:bg-[#2C494E] text-[#FFC64F] font-bold shadow-md" data-testid="new-car-button">
              <Plus className="w-4 h-4 mr-1" /> New car
            </Button>
          </DialogTrigger>
          <DialogContent className="w-[96vw] sm:max-w-md max-h-[90dvh] overflow-y-auto p-4 sm:p-6 rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-[#20373B] font-bold text-lg">
                {editing ? "Edit car" : "Add new car"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Registration no.</Label>
                <Input
                  value={form.registration_no}
                  onChange={(e) => setForm({ ...form, registration_no: e.target.value.toUpperCase() })}
                  placeholder="e.g. GA-07-E-1234"
                  data-testid="car-reg-input"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Model</Label>
                <Input
                  value={form.model}
                  onChange={(e) => setForm({ ...form, model: e.target.value })}
                  placeholder="e.g. Maruti Ertiga ZXi"
                  data-testid="car-model-input"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Owner</Label>
                <Select value={form.owner_id} onValueChange={(v) => setForm({ ...form, owner_id: v })}>
                  <SelectTrigger data-testid="car-owner-select"><SelectValue placeholder="Select owner" /></SelectTrigger>
                  <SelectContent>{owners.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              {/* Rental Basis with Owner */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-[#20373B]">Rental Basis with Owner</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, billing_type: "daily" })}
                    className={`py-2 px-3 rounded-lg text-xs font-bold border transition-all text-center ${
                      form.billing_type !== "monthly"
                        ? "bg-[#20373B] text-[#FFC64F] border-[#20373B] shadow-xs"
                        : "bg-white text-slate-600 border-[#C3E7F1] hover:bg-slate-50"
                    }`}
                  >
                    🚗 Per-Day (₹/day)
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, billing_type: "monthly" })}
                    className={`py-2 px-3 rounded-lg text-xs font-bold border transition-all text-center ${
                      form.billing_type === "monthly"
                        ? "bg-[#20373B] text-[#FFC64F] border-[#20373B] shadow-xs"
                        : "bg-white text-slate-600 border-[#C3E7F1] hover:bg-slate-50"
                    }`}
                  >
                    📅 Monthly Lease (₹/mo)
                  </button>
                </div>
              </div>

              {form.billing_type === "monthly" ? (
                <div className="p-3 bg-purple-50/70 border border-purple-200 rounded-lg space-y-3">
                  <div className="text-[11px] text-purple-900 font-medium leading-relaxed">
                    💡 <strong>Monthly Lease / Retainer:</strong> Fixed payout owed to the owner each month (e.g. ₹30,000). You can post monthly retainers with 1 click in the owner ledger!
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Monthly Cost (₹/mo)</Label>
                      <Input
                        type="number"
                        value={form.monthly_cost_rate}
                        onChange={(e) => setForm({ ...form, monthly_cost_rate: e.target.value })}
                        placeholder="e.g. 30000"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Billing Cycle Day</Label>
                      <Input
                        type="number"
                        min="1"
                        max="31"
                        value={form.billing_cycle_day}
                        onChange={(e) => setForm({ ...form, billing_cycle_day: e.target.value })}
                        placeholder="1"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Default Daily Cost Rate (₹/day)</Label>
                  <Input
                    type="number"
                    value={form.default_cost_rate}
                    onChange={(e) => setForm({ ...form, default_cost_rate: e.target.value })}
                    placeholder="e.g. 1500"
                    data-testid="car-rate-input"
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={save} disabled={saving} className="bg-[#20373B] hover:bg-[#2C494E] text-[#FFC64F] font-bold" data-testid="car-save-button">
                {saving ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      }
    >
      <div className="bg-white border border-[#C3E7F1] rounded-xl overflow-hidden shadow-xs">
        {/* 📱 Mobile Car Cards (<sm) */}
        <div className="block sm:hidden divide-y divide-[#C3E7F1]/60">
          {rows.map((c) => (
            <div key={c.id} className="p-3.5 space-y-2 bg-white">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-bold text-[#20373B] text-base">{c.model}</div>
                  <div className="text-xs text-slate-500 font-medium mt-0.5">
                    Owner: <span className="font-semibold text-slate-700">{c.owner_name}</span>
                  </div>
                </div>
                <span className="inline-block px-2.5 py-1 rounded-md bg-[#F4FAFC] border border-[#C3E7F1] text-xs font-mono font-bold text-[#20373B]">
                  {c.registration_no}
                </span>
              </div>

              <div className="flex items-center justify-between pt-1 text-xs">
                <div>
                  {c.billing_type === "monthly" ? (
                    <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-md bg-purple-50 text-purple-800 border border-purple-200">
                      <Calendar className="w-3 h-3 text-purple-600" />
                      {formatInr(c.monthly_cost_rate)}/mo lease
                    </span>
                  ) : (
                    <div>
                      <span className="text-slate-400">Rate: </span>
                      <span className="font-bold font-tabular text-[#20373B]">{formatInr(c.default_cost_rate)}/day</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" onClick={() => openEdit(c)} className="h-7 text-xs border-[#C3E7F1]">
                    Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => del(c)} className="h-7 text-xs text-red-600 hover:bg-red-50">
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          ))}
          {rows.length === 0 && (
            <div className="p-8 text-center text-slate-500 text-sm">No cars registered yet.</div>
          )}
        </div>

        {/* 💻 Tablet & Desktop Table View (hidden sm:block) */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-sm" data-testid="cars-table">
            <thead className="bg-[#F4FAFC] text-[11px] uppercase tracking-wider text-[#20373B]/70 border-b border-[#C3E7F1]">
              <tr>
                <th className="text-left px-5 py-3 font-bold">Model</th>
                <th className="text-left px-5 py-3 font-bold">Registration</th>
                <th className="text-left px-5 py-3 font-bold">Owner</th>
                <th className="text-left px-5 py-3 font-bold">Contract Basis</th>
                <th className="text-right px-5 py-3 font-bold">Cost Rate</th>
                <th className="text-right px-5 py-3 font-bold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#C3E7F1]/50">
              {rows.map((c) => (
                <tr key={c.id} className="dense-row hover:bg-[#C3E7F1]/20 transition-colors">
                  <td className="px-5 py-3 font-semibold text-[#20373B]">{c.model}</td>
                  <td className="px-5 py-3 text-slate-600 font-mono text-xs font-semibold">{c.registration_no}</td>
                  <td className="px-5 py-3 text-slate-700 font-medium">{c.owner_name}</td>
                  <td className="px-5 py-3">
                    {c.billing_type === "monthly" ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-800 border border-purple-200">
                        <Calendar className="w-3 h-3 text-purple-600" /> Monthly Lease
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                        <CarIcon className="w-3 h-3 text-slate-500" /> Per-Day Booking
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right font-tabular font-bold text-[#20373B]">
                    {c.billing_type === "monthly" ? (
                      <span className="text-purple-900">{formatInr(c.monthly_cost_rate)}/mo</span>
                    ) : (
                      <span>{formatInr(c.default_cost_rate)}/day</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right whitespace-nowrap">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(c)} className="h-7 text-xs text-[#519CAB] hover:bg-[#C3E7F1]/20">
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => del(c)} className="h-7 text-xs text-red-600 hover:bg-red-50">
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-12 text-center text-slate-500">No cars yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}

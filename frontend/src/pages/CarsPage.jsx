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
import { Plus } from "lucide-react";

export default function CarsPage() {
  const [rows, setRows] = useState([]);
  const [owners, setOwners] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ registration_no: "", model: "", owner_id: "", default_cost_rate: "" });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [c, o] = await Promise.all([api.get("/cars"), api.get("/owners")]);
    setRows(c.data); setOwners(o.data);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      const payload = { ...form, default_cost_rate: Number(form.default_cost_rate || 0) };
      if (editing) await api.put(`/cars/${editing.id}`, payload);
      else await api.post("/cars", payload);
      toast.success(editing ? "Car updated" : "Car added");
      setOpen(false); setEditing(null);
      setForm({ registration_no: "", model: "", owner_id: "", default_cost_rate: "" });
      await load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally { setSaving(false); }
  };

  const openEdit = (c) => {
    setEditing(c);
    setForm({
      registration_no: c.registration_no, model: c.model,
      owner_id: c.owner_id, default_cost_rate: c.default_cost_rate,
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
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditing(null); setForm({ registration_no: "", model: "", owner_id: "", default_cost_rate: "" }); } }}>
          <DialogTrigger asChild>
            <Button className="bg-[#20373B] hover:bg-[#2C494E] text-[#FFC64F] font-bold shadow-md" data-testid="new-car-button">
              <Plus className="w-4 h-4 mr-1" /> New car
            </Button>
          </DialogTrigger>
          <DialogContent className="w-[95vw] sm:max-w-md max-h-[88vh] overflow-y-auto p-4 sm:p-6">
            <DialogHeader><DialogTitle className="text-[#20373B] font-bold text-lg">{editing ? "Edit car" : "Add new car"}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5"><Label>Registration no.</Label><Input value={form.registration_no} onChange={(e) => setForm({ ...form, registration_no: e.target.value.toUpperCase() })} data-testid="car-reg-input" /></div>
              <div className="space-y-1.5"><Label>Model</Label><Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} data-testid="car-model-input" /></div>
              <div className="space-y-1.5"><Label>Owner</Label>
                <Select value={form.owner_id} onValueChange={(v) => setForm({ ...form, owner_id: v })}>
                  <SelectTrigger data-testid="car-owner-select"><SelectValue placeholder="Select owner" /></SelectTrigger>
                  <SelectContent>{owners.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Default cost rate (₹/day)</Label><Input type="number" value={form.default_cost_rate} onChange={(e) => setForm({ ...form, default_cost_rate: e.target.value })} data-testid="car-rate-input" /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={save} disabled={saving} className="bg-[#20373B] hover:bg-[#2C494E] text-[#FFC64F] font-bold" data-testid="car-save-button">{saving ? "Saving…" : "Save"}</Button>
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
                  <span className="text-slate-400">Default Rate: </span>
                  <span className="font-bold font-tabular text-[#20373B]">{formatInr(c.default_cost_rate)}/day</span>
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
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="text-left px-5 py-2.5 font-semibold">Model</th>
              <th className="text-left px-5 py-2.5 font-semibold">Registration</th>
              <th className="text-left px-5 py-2.5 font-semibold">Owner</th>
              <th className="text-right px-5 py-2.5 font-semibold">Default rate (₹/day)</th>
              <th className="text-right px-5 py-2.5 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((c) => (
              <tr key={c.id} className="dense-row">
                <td className="px-5 py-2.5 font-medium">{c.model}</td>
                <td className="px-5 py-2.5 text-slate-600 font-mono">{c.registration_no}</td>
                <td className="px-5 py-2.5 text-slate-700">{c.owner_name}</td>
                <td className="px-5 py-2.5 text-right font-tabular">{formatInr(c.default_cost_rate)}</td>
                <td className="px-5 py-2.5 text-right">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(c)}>Edit</Button>
                  <Button variant="ghost" size="sm" onClick={() => del(c)} className="text-red-600 hover:text-red-700">Delete</Button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-5 py-12 text-center text-slate-500">No cars yet.</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </AppLayout>
  );
}

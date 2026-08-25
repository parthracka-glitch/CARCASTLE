import React, { useEffect, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { api, formatInr, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, User, Phone, ArrowRight, Car, Users, HelpCircle, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";

/**
 * Generic list page — used for both owners and agents.
 * Props: type = 'owner' | 'agent'
 */
export default function EntitiesPage({ type }) {
  const isOwner = type === "owner";
  const label = isOwner ? "Car Owners" : "Car Drivers";
  const single = isOwner ? "owner" : "driver";
  const endpoint = isOwner ? "/owners" : "/agents";
  const { user } = useAuth();
  const canWrite = user?.role === "super_admin";

  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", contact: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    const { data } = await api.get(endpoint);
    setRows(data);
  };
  useEffect(() => { load(); }, [endpoint]); // eslint-disable-line

  const save = async () => {
    setSaving(true);
    try {
      await api.post(endpoint, form);
      toast.success(`${label} added successfully`);
      setOpen(false);
      setForm({ name: "", contact: "", notes: "" });
      await load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally { setSaving(false); }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`${endpoint}/${deleteTarget.id}`);
      toast.success(`${isOwner ? "Car Owner" : "Car Driver"} "${deleteTarget.name}" deleted successfully`);
      setDeleteTarget(null);
      await load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

  // Calculate global summary stats
  const totalOwed = rows.reduce((acc, r) => acc + Number(r.total_owed || 0), 0);
  const totalPaid = rows.reduce((acc, r) => acc + Number(r.total_paid || 0), 0);
  const totalBalance = totalOwed - totalPaid;

  return (
    <AppLayout
      title={label}
      subtitle={isOwner ? "Vehicle suppliers & fleet owners pool management" : "Car drivers & referral partner commission management"}
      actions={canWrite && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[#20373B] hover:bg-[#2C494E] text-[#FFC64F] font-bold shadow-md" data-testid={`new-${single}-button`}>
              <Plus className="w-4 h-4 mr-1.5" /> Add New {isOwner ? "Car Owner" : "Car Driver"}
            </Button>
          </DialogTrigger>
          <DialogContent className="w-[95vw] sm:max-w-md max-h-[88vh] overflow-y-auto p-4 sm:p-6">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-[#20373B] text-lg font-bold">
                <div className="w-8 h-8 rounded-full bg-[#C3E7F1] flex items-center justify-center text-[#20373B]">
                  {isOwner ? <Car className="w-4 h-4" /> : <Users className="w-4 h-4" />}
                </div>
                Add New {isOwner ? "Car Owner" : "Car Driver"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="p-3 bg-[#F4FAFC] border border-[#C3E7F1] rounded-md text-xs text-slate-600">
                {isOwner ? (
                  <span>💡 <strong>Car Owner:</strong> Person or company supplying cars for your rental fleet. You can assign cars to them under the <strong>Cars</strong> section.</span>
                ) : (
                  <span>💡 <strong>Car Driver:</strong> Driver or partner referring customer bookings. You can assign car drivers to bookings to track commission fees.</span>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Full Name / Business Name</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder={isOwner ? "e.g. Ramesh Desai (Goa Fleet)" : "e.g. Suresh Kumar (Car Driver)"}
                  data-testid={`${single}-name-input`}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Contact Number</Label>
                <Input
                  value={form.contact}
                  onChange={(e) => setForm({ ...form, contact: e.target.value })}
                  placeholder="+91 98765 43210"
                  data-testid={`${single}-contact-input`}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Notes (Optional)</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder={isOwner ? "Bank details, location, preferred payout method..." : "Driver terms, location, contact details..."}
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={save} disabled={saving} className="bg-[#20373B] hover:bg-[#2C494E] text-[#FFC64F] font-bold" data-testid={`${single}-save-button`}>
                {saving ? "Saving…" : `Save ${isOwner ? "Owner" : "Car Driver"}`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    >
      {/* Informative Explanation Banner */}
      <div className="mb-6 p-5 rounded-xl bg-[#20373B] text-white border border-[#2C494E] shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#FFC64F] text-[#20373B] flex items-center justify-center shrink-0 shadow-md mt-0.5 font-bold">
            {isOwner ? <Car className="w-5 h-5" /> : <Users className="w-5 h-5" />}
          </div>
          <div>
            <h3 className="font-display font-bold text-white flex items-center gap-2">
              {isOwner ? "What are Car Owners?" : "What are Car Drivers?"}
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#519CAB]/30 text-[#FFC64F] font-medium border border-[#519CAB]/40">
                {isOwner ? "Vehicle Suppliers" : "Drivers & Referral Partners"}
              </span>
            </h3>
            <p className="text-xs text-[#C3E7F1] mt-1 max-w-3xl leading-relaxed">
              {isOwner ? (
                <>
                  <strong>Car Owners</strong> supply private or commercial vehicles for rental. When you add a car under <strong>Cars</strong>, you link it to an owner. Every time that car is booked, the owner earns a <em>Cost Rate</em> payout which is automatically tracked in their balance ledger.
                </>
              ) : (
                <>
                  <strong>Car Drivers</strong> are drivers or booking partners who handle trips or refer customers. When creating a <strong>Booking</strong>, select a car driver to assign their <em>Driver Fee</em> commission. The system auto-calculates net profits and maintains a driver commission ledger.
                </>
              )}
            </p>
          </div>
        </div>
        <div className="text-xs font-medium text-[#C3E7F1] flex items-center gap-1.5 bg-[#16272A]/80 px-3 py-1.5 rounded-lg border border-[#2C494E] shrink-0">
          <HelpCircle className="w-4 h-4 text-[#FFC64F]" />
          <span>{isOwner ? "Linked in: Cars & Payouts" : "Linked in: Bookings & Payouts"}</span>
        </div>
      </div>

      {/* Summary Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-[#C3E7F1] rounded-xl p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wider font-semibold text-[#20373B]/70">Total {label}</div>
          <div className="text-2xl font-bold font-display text-[#20373B] mt-1">{rows.length}</div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
            Registered in system
          </div>
        </div>
        <div className="bg-white border border-[#C3E7F1] rounded-xl p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wider font-semibold text-[#20373B]/70">Lifetime Owed</div>
          <div className="text-2xl font-bold font-tabular text-[#20373B] mt-1">{formatInr(totalOwed)}</div>
          <div className="text-[11px] text-slate-500 mt-1">Total accumulated payouts/commissions</div>
        </div>
        <div className="bg-white border border-[#C3E7F1] rounded-xl p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wider font-semibold text-[#20373B]/70">Lifetime Paid</div>
          <div className="text-2xl font-bold font-tabular text-[#519CAB] mt-1">{formatInr(totalPaid)}</div>
          <div className="text-[11px] text-slate-500 mt-1">Total settled payments</div>
        </div>
        <div className="bg-white border border-[#C3E7F1] rounded-xl p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wider font-semibold text-[#20373B]/70">Current Pending Balance</div>
          <div className={`text-2xl font-bold font-tabular mt-1 ${totalBalance > 0 ? "text-red-600" : "text-slate-500"}`}>
            {formatInr(totalBalance)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Unsettled payout obligations</div>
        </div>
      </div>

      {/* Grid of Entity Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 stagger" data-testid={`${single}-grid`}>
        {rows.map((o) => {
          const balance = Number(o.total_owed || 0) - Number(o.total_paid || 0);
          return (
            <Link
              key={o.id}
              to={`/${isOwner ? "owners" : "agents"}/${o.id}`}
              className="animate-fade-up bg-white border border-[#C3E7F1] rounded-xl p-5 hover:border-[#519CAB] hover:shadow-md hover:-translate-y-0.5 transition-all block group relative"
              data-testid={`${single}-card-${o.id}`}
            >
              <div className="flex items-start justify-between">
                <div className="w-11 h-11 rounded-full bg-[#C3E7F1]/30 border border-[#C3E7F1] flex items-center justify-center group-hover:bg-[#C3E7F1] transition-colors">
                  {isOwner ? <User className="w-5 h-5 text-[#20373B]" /> : <Users className="w-5 h-5 text-[#20373B]" />}
                </div>
                <div className="flex items-center gap-2">
                  {canWrite && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDeleteTarget(o);
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition-all cursor-pointer"
                      title={`Delete ${o.name}`}
                      data-testid={`delete-${single}-${o.id}`}
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </button>
                  )}
                  <div className="flex items-center gap-1 text-xs text-[#519CAB] font-semibold group-hover:translate-x-1 transition-transform">
                    <span>View Payouts</span>
                    <ArrowRight className="w-3.5 h-3.5 text-[#519CAB]" />
                  </div>
                </div>
              </div>

              <div className="mt-3 font-display font-bold text-[#20373B] leading-tight text-base">{o.name}</div>
              <div className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                <Phone className="w-3 h-3 text-slate-400" /> {o.contact || "No contact provided"}
              </div>

              {canWrite && (
                <div className="mt-4 pt-4 border-t border-[#C3E7F1]/60 grid grid-cols-3 gap-2 text-center bg-[#F4FAFC] -mx-5 -mb-5 p-4 rounded-b-xl">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Owed</div>
                    <div className="font-tabular text-sm font-semibold text-slate-700 mt-0.5">{formatInr(o.total_owed)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Paid</div>
                    <div className="font-tabular text-sm font-bold text-[#519CAB] mt-0.5">{formatInr(o.total_paid)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Pending</div>
                    <div className={`font-tabular text-sm font-bold mt-0.5 ${balance > 0 ? "text-red-700" : "text-slate-500"}`}>
                      {formatInr(balance)}
                    </div>
                  </div>
                </div>
              )}
            </Link>
          );
        })}

        {/* Enhanced Empty State */}
        {rows.length === 0 && (
          <div className="col-span-full bg-white border border-[#C3E7F1] rounded-xl p-10 text-center">
            <div className="w-14 h-14 rounded-full bg-[#C3E7F1] text-[#20373B] flex items-center justify-center mx-auto mb-4 font-bold">
              {isOwner ? <Car className="w-7 h-7" /> : <Users className="w-7 h-7" />}
            </div>
            <h3 className="font-display text-lg font-bold text-[#20373B] mb-1">
              No {label} Registered Yet
            </h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto mb-6">
              {isOwner
                ? "Start by adding car owners who supply vehicles for your fleet. Once registered, you can assign cars to them."
                : "Add car drivers, brokers, or hotel partners to track referral commissions and profit margins per booking."}
            </p>
            {canWrite && (
              <Button onClick={() => setOpen(true)} className="bg-[#20373B] hover:bg-[#2C494E] text-[#FFC64F] font-bold">
                <Plus className="w-4 h-4 mr-1.5" /> Click to Add First {isOwner ? "Car Owner" : "Car Driver"}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <Dialog open={Boolean(deleteTarget)} onOpenChange={(openState) => !openState && setDeleteTarget(null)}>
        <DialogContent className="w-[95vw] sm:max-w-md p-5 sm:p-6">
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
              Are you sure you want to delete <strong>{deleteTarget?.name}</strong> from the database?
            </p>
            {isOwner && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 leading-relaxed">
                ⚠️ <strong>Note:</strong> Any cars registered under this owner will also be removed from the fleet.
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 text-white font-bold cursor-pointer"
              data-testid="confirm-delete-button"
            >
              {deleting ? "Deleting…" : `Yes, Delete ${isOwner ? "Owner" : "Driver"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

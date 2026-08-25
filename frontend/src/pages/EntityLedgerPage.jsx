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
import { toast } from "sonner";
import { Bell, IndianRupee, Loader2, User, Phone, CheckCircle2, Trash2 } from "lucide-react";

export default function EntityLedgerPage({ type }) {
  const isOwner = type === "owner";
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canWrite = user?.role === "super_admin";

  const [entity, setEntity] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [payOpen, setPayOpen] = useState(false);
  const [payEntry, setPayEntry] = useState(null);
  const [payAmt, setPayAmt] = useState("");
  const [payNote, setPayNote] = useState("");
  const [delOpen, setDelOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    const [e, l] = await Promise.all([
      api.get(`/${isOwner ? "owners" : "agents"}/${id}`),
      api.get("/ledger", { params: { entity_type: type, entity_id: id } }),
    ]);
    setEntity(e.data);
    setEntries(l.data);
    setLoading(false);
  };
  useEffect(() => { load(); }, [id]); // eslint-disable-line

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

  if (loading || !entity) {
    return (
      <AppLayout title="Payout Statement">
        <div className="flex items-center gap-2 text-slate-500"><Loader2 className="w-4 h-4 animate-spin text-[#519CAB]" /> Loading…</div>
      </AppLayout>
    );
  }

  const balance = Number(entity.total_owed) - Number(entity.total_paid);

  return (
    <AppLayout
      title={entity.name}
      subtitle={isOwner ? "Car owner payout statement & dues" : "Car driver payout statement & dues"}
      actions={
        canWrite && (
          <Button
            variant="outline"
            onClick={() => setDelOpen(true)}
            className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 font-semibold text-xs h-9 shadow-xs cursor-pointer"
            data-testid="delete-entity-header-button"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1 text-red-500" />
            Delete {isOwner ? "Owner" : "Driver"}
          </Button>
        )
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="bg-white border border-[#C3E7F1] rounded-xl p-6 lg:col-span-1 shadow-xs">
          <div className="w-14 h-14 rounded-full bg-[#C3E7F1]/30 border border-[#C3E7F1] flex items-center justify-center">
            <User className="w-7 h-7 text-[#20373B]" />
          </div>
          <div className="mt-4 font-display text-xl font-bold text-[#20373B]">{entity.name}</div>
          <div className="mt-1 text-sm text-slate-500 flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5" />{entity.contact}
          </div>
          {isOwner && entity.cars && (
            <div className="mt-4 pt-4 border-t border-[#C3E7F1]/60">
              <div className="text-[11px] uppercase tracking-widest text-slate-500 font-semibold mb-2">Cars supplied</div>
              {entity.cars.length === 0 && <div className="text-sm text-slate-400">None yet</div>}
              {entity.cars.map((c) => (
                <div key={c.id} className="text-sm py-1 flex justify-between">
                  <span className="font-medium text-[#20373B]">{c.model}</span>
                  <span className="text-xs font-mono text-[#519CAB]">{c.registration_no}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <div className="bg-white border border-[#C3E7F1] rounded-xl p-4 sm:p-5 shadow-xs">
            <div className="text-[11px] uppercase tracking-widest text-[#20373B]/70 font-bold">Lifetime Owed</div>
            <div className="font-display text-2xl font-extrabold text-[#20373B] mt-2 font-tabular">{formatInr(entity.total_owed)}</div>
          </div>
          <div className="bg-white border border-[#C3E7F1] rounded-xl p-4 sm:p-5 shadow-xs">
            <div className="text-[11px] uppercase tracking-widest text-[#20373B]/70 font-bold">Lifetime Paid</div>
            <div className="font-display text-2xl font-extrabold text-emerald-600 mt-2 font-tabular">{formatInr(entity.total_paid)}</div>
          </div>
          <div className="bg-white border border-[#C3E7F1] rounded-xl p-4 sm:p-5 shadow-xs">
            <div className="text-[11px] uppercase tracking-widest text-[#20373B]/70 font-bold">Pending Due</div>
            <div className={`font-display text-2xl font-extrabold mt-2 font-tabular ${balance > 0 ? "text-red-700" : "text-slate-500"}`}>
              {formatInr(balance)}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-[#C3E7F1] rounded-xl overflow-hidden shadow-xs">
        <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-[#C3E7F1] bg-[#F4FAFC] flex items-center justify-between">
          <div className="font-display font-bold text-[#20373B]">Payout History & Dues</div>
          <div className="text-xs text-[#519CAB] font-semibold">{entries.length} records</div>
        </div>

        {/* 📱 Mobile Payout Cards (<sm) */}
        <div className="block sm:hidden divide-y divide-[#C3E7F1]/60">
          {entries.map((e) => {
            const bal = Math.max(0, Number(e.amount) - Number(e.amount_paid));
            return (
              <div key={e.id} className="p-3.5 space-y-2 bg-white" data-testid={`ledger-card-${e.id}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-bold text-[#20373B] text-sm">{e.description}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{formatDate(e.created_at)}</div>
                  </div>
                  <StatusPill status={e.status} />
                </div>

                <div className="grid grid-cols-3 gap-2 text-center p-2 rounded-lg bg-[#F4FAFC] border border-[#C3E7F1]/60 text-xs">
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
          {entries.length === 0 && (
            <div className="p-8 text-center text-slate-500 text-sm">No payout records yet.</div>
          )}
        </div>

        {/* 💻 Tablet & Desktop Table View (hidden sm:block) */}
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
            {entries.map((e) => {
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
            {entries.length === 0 && (
              <tr><td colSpan={7} className="px-5 py-12 text-center text-slate-500">No payout records yet.</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {/* Payment Settlement Dialog */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="w-[95vw] sm:max-w-md max-h-[88vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader><DialogTitle className="text-[#20373B] font-bold">Record Payment Settlement</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="p-3 bg-[#F4FAFC] border border-[#C3E7F1] rounded-lg text-xs text-[#20373B]">
              <strong>Details:</strong> {payEntry?.description}
            </div>
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

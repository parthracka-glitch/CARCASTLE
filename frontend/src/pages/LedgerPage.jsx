import React, { useEffect, useState } from "react";
import AppLayout from "@/components/AppLayout";
import StatusPill from "@/components/StatusPill";
import { api, formatInr, formatDate, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Bell, IndianRupee, Wallet, HelpCircle, CheckCircle2 } from "lucide-react";

export default function LedgerPage() {
  const [tab, setTab] = useState("owner");
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState("all");
  const [payOpen, setPayOpen] = useState(false);
  const [payEntry, setPayEntry] = useState(null);
  const [payAmt, setPayAmt] = useState("");
  const [payNote, setPayNote] = useState("");

  const load = async () => {
    const params = { entity_type: tab };
    if (status !== "all") params.status = status;
    const { data } = await api.get("/ledger", { params });
    setRows(data);
  };
  useEffect(() => { load(); }, [tab, status]); // eslint-disable-line

  const openPay = (e) => {
    setPayEntry(e);
    setPayAmt(String(Number(e.amount) - Number(e.amount_paid)));
    setPayNote("");
    setPayOpen(true);
  };

  const submitPay = async () => {
    try {
      await api.post(`/ledger/${payEntry.id}/pay`, { amount_paid: Number(payAmt), note: payNote });
      toast.success("Payment recorded successfully");
      setPayOpen(false);
      await load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const remind = async (e) => {
    try {
      const { data } = await api.post(`/ledger/${e.id}/remind`);
      toast.success("Reminder sent", { description: data.message });
      await load();
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };

  const totals = rows.reduce((acc, e) => {
    acc.owed += Number(e.amount || 0);
    acc.paid += Number(e.amount_paid || 0);
    acc.balance += Number(e.amount || 0) - Number(e.amount_paid || 0);
    return acc;
  }, { owed: 0, paid: 0, balance: 0 });

  return (
    <AppLayout title="Payouts & Dues" subtitle="Track & settle pending payments to Car Owners and Drivers.">
      
      {/* Informative Explanation Banner */}
      <div className="mb-6 p-5 rounded-xl bg-[#20373B] text-white shadow-md border border-[#2C494E] flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-lg bg-[#FFC64F] text-[#20373B] flex items-center justify-center shrink-0 shadow-md mt-0.5 font-bold">
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-display font-bold text-white flex items-center gap-2 text-base">
              What is Payouts & Dues?
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#519CAB]/30 text-[#FFC64F] font-medium border border-[#519CAB]/40">
                Payment Tracking
              </span>
            </h3>
            <p className="text-xs text-[#C3E7F1] mt-1 max-w-3xl leading-relaxed">
              This screen tracks what you owe to <strong>Car Owners</strong> (vehicle rent) and <strong>Car Drivers</strong> (transfer fees). Every time a booking is created, the system auto-calculates the payout. Use this screen to record settlements (UPI/Cash/Bank) and send payment reminders.
            </p>
          </div>
        </div>
        <div className="text-xs font-medium text-[#C3E7F1] flex items-center gap-1.5 bg-[#16272A]/80 px-3 py-1.5 rounded-lg border border-[#2C494E] shrink-0">
          <HelpCircle className="w-4 h-4 text-[#FFC64F]" />
          <span>Auto-calculated per booking</span>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex items-center justify-between mb-4">
          <TabsList className="bg-[#C3E7F1]/30 border border-[#C3E7F1]">
            <TabsTrigger value="owner" data-testid="ledger-tab-owner" className="data-[state=active]:bg-white data-[state=active]:text-[#20373B] font-semibold">
              Car Owner Payouts
            </TabsTrigger>
            <TabsTrigger value="agent" data-testid="ledger-tab-agent" className="data-[state=active]:bg-white data-[state=active]:text-[#20373B] font-semibold">
              Car Driver Fees
            </TabsTrigger>
          </TabsList>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-40 h-9 bg-white border-[#C3E7F1] text-[#20373B]" data-testid="ledger-status-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="partial">Partial</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-white border border-[#C3E7F1] rounded-xl p-4 shadow-xs">
            <div className="text-xs uppercase tracking-wider font-semibold text-[#20373B]/70">Total Owed</div>
            <div className="font-display text-2xl font-bold mt-1 font-tabular text-[#20373B]">{formatInr(totals.owed)}</div>
          </div>
          <div className="bg-white border border-[#C3E7F1] rounded-xl p-4 shadow-xs">
            <div className="text-xs uppercase tracking-wider font-semibold text-[#20373B]/70">Total Settled (Paid)</div>
            <div className="font-display text-2xl font-bold text-emerald-600 mt-1 font-tabular">{formatInr(totals.paid)}</div>
          </div>
          <div className="bg-white border border-[#C3E7F1] rounded-xl p-4 shadow-xs">
            <div className="text-xs uppercase tracking-wider font-semibold text-[#20373B]/70">Current Pending Balance</div>
            <div className={`font-display text-2xl font-bold mt-1 font-tabular ${totals.balance > 0 ? "text-red-600" : "text-slate-500"}`}>
              {formatInr(totals.balance)}
            </div>
          </div>
        </div>

        <TabsContent value={tab}>
          <div className="bg-white border border-[#C3E7F1] rounded-xl overflow-hidden shadow-xs">
            <table className="w-full text-sm" data-testid="ledger-table">
              <thead className="bg-[#F4FAFC] text-[11px] uppercase tracking-wider text-[#20373B]/70 border-b border-[#C3E7F1]">
                <tr>
                  <th className="text-left px-5 py-3 font-bold">Date</th>
                  <th className="text-left px-5 py-3 font-bold">Recipient</th>
                  <th className="text-left px-5 py-3 font-bold">Description</th>
                  <th className="text-right px-5 py-3 font-bold">Total Cost</th>
                  <th className="text-right px-5 py-3 font-bold">Pending Due</th>
                  <th className="text-left px-5 py-3 font-bold">Status</th>
                  <th className="text-right px-5 py-3 font-bold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#C3E7F1]/50">
                {rows.map((e) => {
                  const bal = Math.max(0, Number(e.amount || 0) - Number(e.amount_paid || 0));
                  return (
                    <tr key={e.id} className="dense-row hover:bg-[#C3E7F1]/20 transition-colors">
                      <td className="px-5 py-3 text-slate-600">{formatDate(e.created_at)}</td>
                      <td className="px-5 py-3 font-bold text-[#20373B]">{e.entity_name}</td>
                      <td className="px-5 py-3 text-slate-600">{e.description}</td>
                      <td className="px-5 py-3 text-right font-tabular font-medium">{formatInr(e.amount)}</td>
                      <td className={`px-5 py-3 text-right font-tabular font-bold ${bal > 0 ? "text-red-600" : "text-slate-500"}`}>{formatInr(bal)}</td>
                      <td className="px-5 py-3"><StatusPill status={e.status} /></td>
                      <td className="px-5 py-3 text-right whitespace-nowrap">
                        {e.status !== "paid" ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <Button variant="outline" size="sm" onClick={() => openPay(e)} className="h-8 border-[#519CAB] text-[#20373B] hover:bg-[#C3E7F1]/30 font-semibold" data-testid={`ledger-full-pay-${e.id}`}>
                              <IndianRupee className="w-3.5 h-3.5 mr-1 text-[#519CAB]" /> Pay
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => remind(e)} className="h-8 text-[#519CAB] hover:bg-[#C3E7F1]/20 font-semibold" data-testid={`ledger-full-remind-${e.id}`}>
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
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-14 text-center text-slate-500">
                      <Wallet className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <div className="font-semibold text-slate-700">No payout records found</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="text-[#20373B] font-bold">Record Payment Settlement</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="p-3 bg-[#F4FAFC] border border-[#C3E7F1] rounded-lg text-xs text-[#20373B]">
              <strong>Recipient:</strong> {payEntry?.entity_name}<br />
              <strong>Details:</strong> {payEntry?.description}
            </div>
            <div className="space-y-1.5">
              <Label>Payment Amount (₹)</Label>
              <Input type="number" value={payAmt} onChange={(e) => setPayAmt(e.target.value)} placeholder="Enter amount paid" />
            </div>
            <div className="space-y-1.5">
              <Label>Payment Method / Note</Label>
              <Input value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="e.g. GPay, PhonePe, Cash, HDFC Bank..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(false)}>Cancel</Button>
            <Button onClick={submitPay} className="bg-[#20373B] hover:bg-[#2C494E] text-[#FFC64F] font-bold">Confirm & Record Payment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

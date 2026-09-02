import React, { useEffect, useState, useMemo } from "react";
import AppLayout from "@/components/AppLayout";
import { api, formatInr, formatDate, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Loader2, Plus, Trash2, Tag, Wrench, Sparkles, AlertTriangle, Receipt, Car, Filter, Calendar
} from "lucide-react";

export const expenseCatMeta = {
  fuel: { label: "Fuel (Petrol/Diesel)", icon: "⛽", badge: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  fastag: { label: "FASTag / Toll", icon: "🏷️", badge: "bg-blue-50 text-blue-800 border-blue-200" },
  driver_payment: { label: "Driver Extra Cash", icon: "🚕", badge: "bg-amber-50 text-amber-800 border-amber-200" },
  service: { label: "Service / Repair", icon: "🔧", badge: "bg-purple-50 text-purple-800 border-purple-200" },
  wash: { label: "Car Wash", icon: "🧼", badge: "bg-cyan-50 text-cyan-800 border-cyan-200" },
  challan: { label: "Traffic Challan", icon: "⚠️", badge: "bg-red-50 text-red-800 border-red-200" },
  other: { label: "Other Expense", icon: "📝", badge: "bg-slate-100 text-slate-800 border-slate-200" },
};

export default function ExpensesPage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";

  const [loading, setLoading] = useState(true);
  const [expenses, setExpenses] = useState([]);
  const [summary, setSummary] = useState({
    total_expenses: 0,
    fuel_total: 0,
    fastag_total: 0,
    driver_payment_total: 0,
    service_total: 0,
    wash_total: 0,
    challan_total: 0,
    other_total: 0,
  });
  const [cars, setCars] = useState([]);

  // Filters
  const [filterCat, setFilterCat] = useState("all");
  const [filterCar, setFilterCar] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    category: "fuel",
    amount: "",
    date: new Date().toISOString().slice(0, 10),
    car_id: "none",
    payment_method: "cash",
    description: "",
    driver_name: "",
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [{ data: expData }, { data: sumData }, { data: cData }] = await Promise.all([
        api.get("/expenses", { params: { limit: 500 } }).catch(() => ({ data: [] })),
        api.get("/expenses/summary").catch(() => ({ data: {} })),
        api.get("/cars").catch(() => ({ data: [] })),
      ]);
      if (Array.isArray(expData)) setExpenses(expData);
      if (sumData) setSummary((prev) => ({ ...prev, ...sumData }));
      if (Array.isArray(cData)) setCars(cData);
    } catch (e) {
      toast.error("Failed to load expenses data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSave = async () => {
    if (!form.amount || Number(form.amount) <= 0) {
      toast.error("Please enter a valid expense amount");
      return;
    }
    setSaving(true);
    try {
      await api.post("/expenses", {
        category: form.category,
        amount: Number(form.amount),
        date: form.date || new Date().toISOString().slice(0, 10),
        car_id: form.car_id !== "none" ? form.car_id : null,
        payment_method: form.payment_method,
        description: form.description,
        driver_name: form.driver_name,
      });
      toast.success("Expense recorded successfully");
      setModalOpen(false);
      setForm({
        category: "fuel",
        amount: "",
        date: new Date().toISOString().slice(0, 10),
        car_id: "none",
        payment_method: "cash",
        description: "",
        driver_name: "",
      });
      await loadData();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed to save expense");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this expense record?")) return;
    try {
      await api.delete(`/expenses/${id}`);
      toast.success("Expense deleted");
      await loadData();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed to delete expense");
    }
  };

  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      if (filterCat !== "all" && e.category !== filterCat) return false;
      if (filterCar !== "all" && e.car_id !== filterCar) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const desc = (e.description || "").toLowerCase();
        const reg = (e.car_registration || "").toLowerCase();
        const model = (e.car_model || "").toLowerCase();
        const driver = (e.driver_name || "").toLowerCase();
        if (!desc.includes(q) && !reg.includes(q) && !model.includes(q) && !driver.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [expenses, filterCat, filterCar, searchTerm]);

  return (
    <AppLayout
      title="Expenses"
      subtitle="Track owner personal & business out-of-pocket expenses (Fuel, FASTags, Driver Cash, Servicing & Washes)"
      actions={
        <Button
          onClick={() => setModalOpen(true)}
          className="bg-[#20373B] hover:bg-[#2C494E] text-[#FFC64F] font-bold text-xs h-8 sm:h-9 px-3.5 shadow-xs"
        >
          <Plus className="w-3.5 h-3.5 mr-1.5" /> Record Expense
        </Button>
      }
    >
      {/* 6 Category Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3 mb-6">
        <Card
          onClick={() => setFilterCat("all")}
          className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
            filterCat === "all"
              ? "bg-[#20373B] text-white border-[#20373B] shadow-sm"
              : "bg-white border-[#C3E7F1] hover:border-[#519CAB]"
          }`}
        >
          <div className="text-[10px] sm:text-[11px] uppercase tracking-wider font-bold opacity-80">All Expenses</div>
          <div className={`font-display text-lg sm:text-xl font-extrabold mt-1 font-tabular ${filterCat === "all" ? "text-[#FFC64F]" : "text-[#20373B]"}`}>
            {formatInr(summary.total_expenses)}
          </div>
          <div className="text-[10px] opacity-70 mt-0.5">{expenses.length} records</div>
        </Card>

        <Card
          onClick={() => setFilterCat("fuel")}
          className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
            filterCat === "fuel"
              ? "bg-emerald-800 text-white border-emerald-800 shadow-sm"
              : "bg-emerald-50/40 border-emerald-200 hover:border-emerald-400"
          }`}
        >
          <div className="text-[10px] sm:text-[11px] uppercase tracking-wider font-bold opacity-80 flex items-center gap-1">
            <span>⛽</span> Fuel
          </div>
          <div className={`font-display text-lg sm:text-xl font-extrabold mt-1 font-tabular ${filterCat === "fuel" ? "text-emerald-200" : "text-emerald-800"}`}>
            {formatInr(summary.fuel_total)}
          </div>
          <div className="text-[10px] opacity-70 mt-0.5">Petrol / Diesel</div>
        </Card>

        <Card
          onClick={() => setFilterCat("fastag")}
          className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
            filterCat === "fastag"
              ? "bg-blue-800 text-white border-blue-800 shadow-sm"
              : "bg-blue-50/40 border-blue-200 hover:border-blue-400"
          }`}
        >
          <div className="text-[10px] sm:text-[11px] uppercase tracking-wider font-bold opacity-80 flex items-center gap-1">
            <span>🏷️</span> FASTag
          </div>
          <div className={`font-display text-lg sm:text-xl font-extrabold mt-1 font-tabular ${filterCat === "fastag" ? "text-blue-200" : "text-blue-800"}`}>
            {formatInr(summary.fastag_total)}
          </div>
          <div className="text-[10px] opacity-70 mt-0.5">Tolls & Tags</div>
        </Card>

        <Card
          onClick={() => setFilterCat("driver_payment")}
          className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
            filterCat === "driver_payment"
              ? "bg-amber-800 text-white border-amber-800 shadow-sm"
              : "bg-amber-50/40 border-amber-200 hover:border-amber-400"
          }`}
        >
          <div className="text-[10px] sm:text-[11px] uppercase tracking-wider font-bold opacity-80 flex items-center gap-1">
            <span>🚕</span> Driver Cash
          </div>
          <div className={`font-display text-lg sm:text-xl font-extrabold mt-1 font-tabular ${filterCat === "driver_payment" ? "text-amber-200" : "text-amber-800"}`}>
            {formatInr(summary.driver_payment_total)}
          </div>
          <div className="text-[10px] opacity-70 mt-0.5">Spot duty cash</div>
        </Card>

        <Card
          onClick={() => setFilterCat("service")}
          className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
            filterCat === "service"
              ? "bg-purple-800 text-white border-purple-800 shadow-sm"
              : "bg-purple-50/40 border-purple-200 hover:border-purple-400"
          }`}
        >
          <div className="text-[10px] sm:text-[11px] uppercase tracking-wider font-bold opacity-80 flex items-center gap-1">
            <span>🔧</span> Service
          </div>
          <div className={`font-display text-lg sm:text-xl font-extrabold mt-1 font-tabular ${filterCat === "service" ? "text-purple-200" : "text-purple-800"}`}>
            {formatInr(summary.service_total)}
          </div>
          <div className="text-[10px] opacity-70 mt-0.5">Repairs & Garage</div>
        </Card>

        <Card
          onClick={() => setFilterCat("wash")}
          className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
            filterCat === "wash"
              ? "bg-cyan-800 text-white border-cyan-800 shadow-sm"
              : "bg-cyan-50/40 border-cyan-200 hover:border-cyan-400"
          }`}
        >
          <div className="text-[10px] sm:text-[11px] uppercase tracking-wider font-bold opacity-80 flex items-center gap-1">
            <span>🧼</span> Washes
          </div>
          <div className={`font-display text-lg sm:text-xl font-extrabold mt-1 font-tabular ${filterCat === "wash" ? "text-cyan-200" : "text-cyan-800"}`}>
            {formatInr(summary.wash_total)}
          </div>
          <div className="text-[10px] opacity-70 mt-0.5">Washing & Detailing</div>
        </Card>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-[#C3E7F1] rounded-2xl p-4 shadow-xs mb-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Category Dropdown */}
          <div className="w-40 sm:w-48">
            <Select value={filterCat} onValueChange={setFilterCat}>
              <SelectTrigger className="h-8 text-xs border-[#C3E7F1] bg-[#F4FAFC]">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="fuel">⛽ Fuel (Petrol / Diesel)</SelectItem>
                <SelectItem value="fastag">🏷️ FASTag / Toll</SelectItem>
                <SelectItem value="driver_payment">🚕 Driver Extra Cash</SelectItem>
                <SelectItem value="service">🔧 Service / Repair</SelectItem>
                <SelectItem value="wash">🧼 Car Wash</SelectItem>
                <SelectItem value="challan">⚠️ Traffic Challan</SelectItem>
                <SelectItem value="other">📝 Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Vehicle Dropdown */}
          <div className="w-48 sm:w-56">
            <Select value={filterCar} onValueChange={setFilterCar}>
              <SelectTrigger className="h-8 text-xs border-[#C3E7F1] bg-[#F4FAFC]">
                <SelectValue placeholder="All Fleet Vehicles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">🚗 All Fleet Vehicles</SelectItem>
                {cars.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.model} ({c.registration_no})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Search */}
        <div className="relative w-full md:w-64">
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search notes, plate, driver..."
            className="h-8 text-xs border-[#C3E7F1] bg-[#F4FAFC]"
          />
        </div>
      </div>

      {/* Expenses Feed Table / Cards */}
      <div className="bg-white border border-[#C3E7F1] rounded-2xl p-4 sm:p-5 shadow-xs">
        {filteredExpenses.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs bg-[#F4FAFC] rounded-xl border border-dashed border-[#C3E7F1] space-y-2">
            <div className="text-3xl">🧾</div>
            <div className="font-bold text-sm text-slate-700">No expenses found</div>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              No out-of-pocket expenses match the selected filters. Click below to record a new expense.
            </p>
            <Button
              size="sm"
              onClick={() => setModalOpen(true)}
              className="bg-[#20373B] text-[#FFC64F] hover:bg-[#2C494E] text-xs font-bold mt-2"
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Record Expense
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filteredExpenses.map((exp) => {
              const meta = expenseCatMeta[exp.category] || expenseCatMeta.other;
              const isCash = exp.payment_method === "cash";

              return (
                <div
                  key={exp.id}
                  className="p-4 rounded-xl bg-[#F4FAFC] border border-[#C3E7F1] hover:border-[#519CAB] transition-all flex flex-col justify-between space-y-3 shadow-2xs"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-md font-bold uppercase border flex items-center gap-1 ${meta.badge}`}
                      >
                        <span>{meta.icon}</span>
                        <span>{meta.label}</span>
                      </span>

                      <div className="text-right">
                        <span className="font-display font-extrabold text-base text-[#20373B] font-tabular">
                          {formatInr(exp.amount)}
                        </span>
                      </div>
                    </div>

                    {/* Attribution */}
                    {(exp.car_registration || exp.car_model || exp.driver_name) && (
                      <div className="text-xs text-slate-600 flex items-center gap-1.5 flex-wrap pt-0.5">
                        {exp.car_registration && (
                          <span className="font-mono font-bold text-[#20373B] bg-white border border-[#C3E7F1] px-1.5 py-0.5 rounded text-[10px]">
                            {exp.car_registration}
                          </span>
                        )}
                        {exp.car_model && (
                          <span className="text-slate-500 font-medium truncate max-w-[130px]">
                            {exp.car_model}
                          </span>
                        )}
                        {exp.driver_name && (
                          <span className="text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded text-[10px] font-semibold border border-amber-200">
                            Driver: {exp.driver_name}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Description */}
                    {exp.description && (
                      <p className="text-xs text-slate-700 bg-white p-2.5 rounded-lg border border-[#C3E7F1]/60 line-clamp-3">
                        {exp.description}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 text-xs text-slate-400">
                    <div className="flex items-center gap-1.5">
                      <span>{formatDate(exp.date)}</span>
                      <span>·</span>
                      <span className="font-medium text-slate-600">
                        {isCash ? "💵 Cash" : "💳 Online"}
                      </span>
                    </div>

                    {isSuperAdmin && (
                      <button
                        type="button"
                        onClick={() => handleDelete(exp.id)}
                        className="text-slate-400 hover:text-red-600 p-1 rounded transition-colors"
                        title="Delete expense"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Record Expense Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="font-display text-[#20373B] text-lg flex items-center gap-2">
              <span>🧾</span> Record Owner Out-of-Pocket Expense
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3.5 py-2">
            <div>
              <Label className="text-xs font-bold text-[#20373B]">Expense Category</Label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm((p) => ({ ...p, category: v }))}
              >
                <SelectTrigger className="mt-1 border-[#C3E7F1] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fuel">⛽ Fuel (Petrol / Diesel)</SelectItem>
                  <SelectItem value="fastag">🏷️ FASTag / Toll Recharge</SelectItem>
                  <SelectItem value="driver_payment">🚕 Driver Extra / Spot Payment</SelectItem>
                  <SelectItem value="service">🔧 Service / Repair / Maintenance</SelectItem>
                  <SelectItem value="wash">🧼 Car Wash & Cleaning</SelectItem>
                  <SelectItem value="challan">⚠️ Traffic Challan / Fine</SelectItem>
                  <SelectItem value="other">📝 Other Business Expense</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold text-[#20373B]">Amount (₹) *</Label>
                <Input
                  type="number"
                  placeholder="e.g. 1500"
                  value={form.amount}
                  onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
                  className="mt-1 border-[#C3E7F1] text-xs font-tabular font-bold"
                />
              </div>

              <div>
                <Label className="text-xs font-bold text-[#20373B]">Date</Label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
                  className="mt-1 border-[#C3E7F1] text-xs font-tabular"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs font-bold text-[#20373B]">Linked Vehicle (Optional)</Label>
              <Select
                value={form.car_id}
                onValueChange={(v) => setForm((p) => ({ ...p, car_id: v }))}
              >
                <SelectTrigger className="mt-1 border-[#C3E7F1] text-xs">
                  <SelectValue placeholder="General / Unspecified Vehicle" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">General / Unspecified Vehicle</SelectItem>
                  {cars.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      🚗 {c.model} ({c.registration_no})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {form.category === "driver_payment" && (
              <div>
                <Label className="text-xs font-bold text-[#20373B]">Driver Name</Label>
                <Input
                  placeholder="e.g. Manoj, Ramesh"
                  value={form.driver_name}
                  onChange={(e) => setForm((p) => ({ ...p, driver_name: e.target.value }))}
                  className="mt-1 border-[#C3E7F1] text-xs"
                />
              </div>
            )}

            <div>
              <Label className="text-xs font-bold text-[#20373B]">Payment Method</Label>
              <Select
                value={form.payment_method}
                onValueChange={(v) => setForm((p) => ({ ...p, payment_method: v }))}
              >
                <SelectTrigger className="mt-1 border-[#C3E7F1] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">💵 Cash Out-of-Pocket</SelectItem>
                  <SelectItem value="online">💳 Online (UPI / GPay / Bank)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs font-bold text-[#20373B]">Description / Note</Label>
              <Textarea
                placeholder="e.g. Full tank petrol before airport trip, FASTag recharge on highway..."
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                className="mt-1 border-[#C3E7F1] text-xs min-h-[65px]"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setModalOpen(false)}
              className="text-xs border-[#C3E7F1]"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="bg-[#20373B] hover:bg-[#2C494E] text-[#FFC64F] font-bold text-xs"
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1 text-[#FFC64F]" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
              Save Expense
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

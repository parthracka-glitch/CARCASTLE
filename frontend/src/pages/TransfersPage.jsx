import React, { useEffect, useState, useMemo } from "react";
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
import {
  Plane, ChevronRight, ChevronLeft, User, Edit3, IndianRupee, Car, CheckCircle2,
  Clock, HelpCircle, Users, Calendar, Plus, MessageSquare, Phone,
  ExternalLink, Check, ShieldCheck, Tag, Search, Filter, CalendarDays
} from "lucide-react";

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
  transfer_handled_by: "self", // "self" | "driver"
  driver_name: "Owner (Self)",
  driver_contact: "",
  transfer_cost: "1000",
  transfer_driver_share: "0",
  transfer_manoj_share: "1000",
  transfer_driver_paid: true,
  transfer_manoj_paid: false,
  driver_fee: "0",
  driver_fee_paid: "0",
  customer_rate: "1500",
  cost_rate: "1000",
  notes: "",
};

// Reusable card for the Calendar Split View (Pickups vs Drops)
function DutyItemCard({ booking, dutyType, openEdit, sendDriverWhatsApp, toggleSplitPayment, setStatus }) {
  const isSelf = booking.transfer_handled_by === "self" || booking.driver_name === "Owner (Self)";
  const tCost = Number(booking.transfer_cost || 1000);
  const dCut = Number(booking.transfer_driver_share || 400);
  const isPickup = dutyType === "pickup";

  return (
    <Card className="p-3.5 bg-white border border-[#C3E7F1] shadow-2xs rounded-xl hover:border-[#519CAB] transition-all space-y-2.5">
      {/* Passenger & Vehicle header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-bold text-[#20373B] text-sm truncate flex items-center gap-1.5">
            <span>{booking.customer_name}</span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${
                isPickup
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  : "bg-amber-50 text-amber-800 border border-amber-200"
              }`}
            >
              {isPickup ? "🚗 Handover (Give Car)" : "🔄 Return (Collect Car)"}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
            <a
              href={`tel:${booking.customer_contact}`}
              className="flex items-center gap-1 hover:text-[#519CAB] font-semibold text-slate-600"
            >
              <Phone className="w-3 h-3 text-[#519CAB]" />
              <span>{booking.customer_contact || "No phone"}</span>
            </a>
          </div>
        </div>

        {/* Car badge */}
        <div className="text-right shrink-0">
          <div className="font-mono text-xs font-bold text-[#20373B] bg-[#F4FAFC] border border-[#C3E7F1] px-2 py-0.5 rounded-md">
            {booking.car_registration || "Fleet"}
          </div>
          <div className="text-[10px] text-slate-400 truncate max-w-[120px] font-medium mt-0.5">
            {booking.car_model || "Car"}
          </div>
        </div>
      </div>

      {/* Flight & Route */}
      <div className="p-2.5 rounded-lg bg-[#F4FAFC] border border-[#C3E7F1]/60 text-xs space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-slate-700 flex items-center gap-1">
            <Plane className="w-3.5 h-3.5 text-[#519CAB]" />
            {booking.flight_time ? `Flight: ${booking.flight_time}` : `Time: ${booking.pickup_time || "14:30"}`}
          </span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white border border-slate-200 text-[#20373B]">
            {booking.transfer_status?.replace("_", " ") || "scheduled"}
          </span>
        </div>

        <div className="text-[11px] text-slate-600 flex items-start gap-1">
          <span className="text-slate-400 shrink-0 font-bold">{isPickup ? "Pickup Terminal:" : "Pickup Hotel:"}</span>
          <span className="truncate font-medium text-slate-800">
            {booking.transfer_pickup_point || booking.pickup_location || (isPickup ? "MOPA Airport Terminal 1" : "Hotel")}
          </span>
        </div>

        <div className="text-[11px] text-slate-600 flex items-start gap-1">
          <span className="text-slate-400 shrink-0 font-bold">{isPickup ? "Drop Destination:" : "Airport Terminal:"}</span>
          <span className="truncate font-medium text-slate-800">
            {booking.drop_location || (isPickup ? "Hotel / Villa" : "Airport Terminal")}
          </span>
        </div>
      </div>

      {/* Driver Handling & Cut */}
      {isSelf ? (
        <div className="p-2 rounded-lg bg-emerald-50/90 border border-emerald-200 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 font-bold text-emerald-900 text-[11px]">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>Owner Self-Handled</span>
          </div>
          <span className="text-[10px] font-extrabold text-emerald-800 bg-white px-2 py-0.5 rounded border border-emerald-200 font-tabular shrink-0">
            100% Kept: {formatInr(tCost)}
          </span>
        </div>
      ) : (
        <div className="p-2 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-bold text-[#20373B] flex items-center gap-1">
              <Car className="w-3 h-3 text-[#519CAB]" />
              {booking.driver_name || "Driver"}
              {booking.driver_contact && <span className="text-[10px] text-slate-400">({booking.driver_contact})</span>}
            </span>
            <span className="font-tabular font-bold text-[#20373B] text-xs">{formatInr(tCost)} Total</span>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-0.5">
            <button
              type="button"
              onClick={() => toggleSplitPayment(booking, "transfer_driver_paid", booking.transfer_driver_paid)}
              className={`py-1 px-1.5 rounded text-[10px] font-bold border transition-colors cursor-pointer text-center ${
                booking.transfer_driver_paid
                  ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                  : "bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100"
              }`}
            >
              {booking.transfer_driver_paid ? "✅ Driver Cut Paid" : `⏳ Pay Driver: ${formatInr(dCut)}`}
            </button>

            <button
              type="button"
              onClick={() => toggleSplitPayment(booking, "transfer_manoj_paid", booking.transfer_manoj_paid)}
              className={`py-1 px-1.5 rounded text-[10px] font-bold border transition-colors cursor-pointer text-center ${
                booking.transfer_manoj_paid
                  ? "bg-blue-50 text-blue-800 border-blue-300"
                  : "bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100"
              }`}
            >
              {booking.transfer_manoj_paid ? "✅ Profit Kept" : `⏳ Profit: ${formatInr(booking.transfer_manoj_share || Math.max(0, tCost - dCut))}`}
            </button>
          </div>
        </div>
      )}

      {/* Action Footer */}
      <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-slate-100 text-xs">
        <div className="flex items-center gap-1">
          {!isSelf && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => sendDriverWhatsApp(booking)}
              className="h-7 px-2 text-[10px] font-bold border-emerald-300 text-emerald-700 hover:bg-emerald-50 shrink-0"
              title="Send duty details to driver via WhatsApp"
            >
              <MessageSquare className="w-3 h-3 mr-1 text-emerald-600" /> WhatsApp
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openEdit(booking)}
            className="h-7 px-2 text-[10px] text-[#519CAB] hover:bg-[#C3E7F1]/30 font-semibold"
          >
            <Edit3 className="w-3 h-3 mr-1" /> Edit
          </Button>
        </div>

        {/* Quick status cycle */}
        <div className="flex items-center gap-1">
          {booking.transfer_status !== "completed" ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setStatus(booking.id, booking.transfer_status === "scheduled" ? "en_route" : "completed")}
              className="h-7 px-2 text-[10px] font-bold bg-[#F4FAFC] hover:bg-white text-[#20373B] border-[#C3E7F1]"
            >
              {booking.transfer_status === "scheduled" ? "→ En route" : "✓ Mark Done"}
            </Button>
          ) : (
            <span className="text-[10px] font-bold text-emerald-700 flex items-center gap-0.5">
              <Check className="w-3 h-3" /> Completed
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}

export default function TransfersPage() {
  const { user } = useAuth();
  const isOp = user?.role === "operator";
  const [activeTab, setActiveTab] = useState("calendar");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [calendarCarFilter, setCalendarCarFilter] = useState("all");
  const [calendarSearch, setCalendarSearch] = useState("");
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
    transfer_handled_by: "self",
    driver_name: "Owner (Self)",
    driver_contact: "",
    driver_fee: "0",
    driver_fee_paid: "0",
    transfer_cost: "1000",
    transfer_driver_share: "0",
    transfer_driver_paid: true,
    transfer_manoj_share: "1000",
    transfer_manoj_paid: false,
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

  // Dispatch WhatsApp message to driver
  const sendDriverWhatsApp = (b) => {
    const isPickup = b.transfer_type === "airport_pickup";
    const isBoth = b.transfer_type === "both";
    const tType = isBoth ? "AIRPORT PICKUP & DROP" : isPickup ? "AIRPORT PICKUP" : "AIRPORT DROP";
    const dateStr = b.start_date
      ? new Date(b.start_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
      : "";
    const cutAmt = formatInr(b.transfer_driver_share || 400);

    const text =
      `🌴 *CAR CASTLE GOA — AIRPORT TRANSFER DUTY*\n` +
      `🚗 *Duty Type:* ${tType}\n` +
      `📅 *Date:* ${dateStr}\n` +
      `✈️ *Flight / Time:* ${b.flight_time || "To be confirmed"}\n` +
      `📍 *Terminal / Pickup Point:* ${b.transfer_pickup_point || b.pickup_location || "Airport"}\n` +
      `📍 *Drop Destination:* ${b.drop_location || "Goa"}\n` +
      `👤 *Passenger:* ${b.customer_name} (${b.customer_contact || "No phone"})\n` +
      `🚘 *Vehicle:* ${b.car_model || "Car"} (${b.car_registration || "Fleet"})\n` +
      `------------------------------------\n` +
      `💰 *Agreed Cut for Driver:* ${cutAmt}\n` +
      `Please coordinate with the passenger and reach 15 minutes before flight arrival. Safe driving! 🚕✨`;

    const phone = (b.driver_contact || "").replace(/[^0-9]/g, "");
    const phoneParam = phone ? (phone.startsWith("91") ? phone : `91${phone}`) : "";
    const url = phoneParam
      ? `https://wa.me/${phoneParam}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  };

  const createTransfer = async () => {
    if (!newForm.customer_name || !newForm.car_id) {
      toast.error("Please enter customer name and select a car");
      return;
    }
    setSaving(true);
    try {
      const isSelf = newForm.transfer_handled_by === "self";
      const tCost = Number(newForm.transfer_cost || 1000);
      const dCut = isSelf ? 0 : Number(newForm.transfer_driver_share || 400);
      const mShare = isSelf ? tCost : Number(newForm.transfer_manoj_share || Math.max(0, tCost - dCut));

      const payload = {
        customer_name: newForm.customer_name,
        customer_contact: newForm.customer_contact || "N/A",
        car_id: newForm.car_id,
        start_date: newForm.start_date,
        end_date: newForm.end_date || newForm.start_date,
        pickup_location: newForm.pickup_location || "Airport",
        drop_location: newForm.drop_location || "Hotel",
        transfer_type: newForm.transfer_type,
        transfer_handled_by: newForm.transfer_handled_by,
        flight_time: newForm.flight_time,
        transfer_pickup_point: newForm.transfer_pickup_point,
        driver_name: isSelf ? "Owner (Self)" : (newForm.driver_name || "Driver"),
        driver_contact: isSelf ? "" : (newForm.driver_contact || ""),
        driver_fee: dCut,
        driver_fee_paid: isSelf ? 0 : (newForm.transfer_driver_paid ? dCut : 0),
        transfer_cost: tCost,
        transfer_driver_share: dCut,
        transfer_driver_paid: isSelf ? true : Boolean(newForm.transfer_driver_paid),
        transfer_manoj_share: mShare,
        transfer_manoj_paid: Boolean(newForm.transfer_manoj_paid),
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
    const handledBy = b.transfer_handled_by || (b.driver_name === "Owner (Self)" || Number(b.driver_fee) === 0 ? "self" : "driver");
    const tCost = String(b.transfer_cost || 1000);
    const dCut = String(b.transfer_driver_share ?? (handledBy === "self" ? 0 : 400));
    const mShare = String(b.transfer_manoj_share ?? (handledBy === "self" ? tCost : Math.max(0, Number(tCost) - Number(dCut))));

    setForm({
      transfer_handled_by: handledBy,
      driver_name: b.driver_name || (handledBy === "self" ? "Owner (Self)" : "Driver"),
      driver_contact: b.driver_contact || "",
      driver_fee: String(b.driver_fee || dCut),
      driver_fee_paid: String(b.driver_fee_paid || 0),
      transfer_cost: tCost,
      transfer_driver_share: dCut,
      transfer_driver_paid: handledBy === "self" ? true : Boolean(b.transfer_driver_paid),
      transfer_manoj_share: mShare,
      transfer_manoj_paid: Boolean(b.transfer_manoj_paid),
      transfer_status: b.transfer_status || "scheduled",
      transfer_type: b.transfer_type || "airport_drop",
      flight_time: b.flight_time || "",
      transfer_pickup_point: b.transfer_pickup_point || "",
      notes: b.notes || "",
    });
    setEditOpen(true);
  };

  const toggleSplitPayment = async (b, field, currentVal) => {
    try {
      const updates = { [field]: !currentVal };
      await api.put(`/transfers/${b.id}/driver`, updates);
      toast.success(`Updated ${field === "transfer_driver_paid" ? "Driver Cut" : "Manoj / Owner"} status`);
      await load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed to update split payment");
    }
  };

  const saveDriverUpdate = async () => {
    if (!selectedBooking) return;
    setSaving(true);
    try {
      const isSelf = form.transfer_handled_by === "self";
      const tCost = Number(form.transfer_cost || 1000);
      const dCut = isSelf ? 0 : Number(form.transfer_driver_share || 400);
      const mShare = isSelf ? tCost : Number(form.transfer_manoj_share || Math.max(0, tCost - dCut));

      await api.put(`/transfers/${selectedBooking.id}/driver`, {
        transfer_handled_by: form.transfer_handled_by,
        driver_name: isSelf ? "Owner (Self)" : (form.driver_name || "Driver"),
        driver_contact: isSelf ? "" : (form.driver_contact || ""),
        driver_fee: dCut,
        driver_fee_paid: isSelf ? 0 : (form.transfer_driver_paid ? dCut : Number(form.driver_fee_paid || 0)),
        transfer_cost: tCost,
        transfer_driver_share: dCut,
        transfer_driver_paid: isSelf ? true : Boolean(form.transfer_driver_paid),
        transfer_manoj_share: mShare,
        transfer_manoj_paid: Boolean(form.transfer_manoj_paid),
        transfer_status: form.transfer_status,
        transfer_type: form.transfer_type,
        flight_time: form.flight_time,
        transfer_pickup_point: form.transfer_pickup_point,
        notes: form.notes,
      });
      toast.success("Transfer & Driver cut details updated");
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
  const totalDriverPending = Math.max(0, totalDriverFees - totalDriverPaid);
  const totalSelfHandled = rows.filter((r) => r.transfer_handled_by === "self" || r.driver_name === "Owner (Self)").length;

  const openNewForDate = (dateStr, type = "airport_pickup") => {
    setNewForm({
      ...newTransferEmpty,
      start_date: dateStr,
      end_date: dateStr,
      transfer_type: type,
      car_id: carsList.length > 0 ? carsList[0].id : "",
    });
    setNewOpen(true);
  };

  const prevMonth = () => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const goToToday = () => {
    const today = new Date();
    setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDate(today.toISOString().slice(0, 10));
  };

  const isAirportPickup = (b) => b.transfer_type === "airport_pickup" || b.transfer_type === "both";
  const isAirportDrop = (b) => b.transfer_type === "airport_drop" || b.transfer_type === "both";
  const getPickupDate = (b) => (b.start_date || "").slice(0, 10);
  const getDropDate = (b) => ((b.transfer_type === "both" ? b.end_date : (b.end_date || b.start_date)) || "").slice(0, 10);

  const transferDateMap = useMemo(() => {
    const map = {};
    rows.forEach((b) => {
      if (calendarCarFilter !== "all" && b.car_id !== calendarCarFilter) return;

      if (isAirportPickup(b)) {
        const pDate = getPickupDate(b);
        if (pDate) {
          if (!map[pDate]) map[pDate] = { pickups: [], drops: [] };
          map[pDate].pickups.push(b);
        }
      }

      if (isAirportDrop(b)) {
        const dDate = getDropDate(b);
        if (dDate) {
          if (!map[dDate]) map[dDate] = { pickups: [], drops: [] };
          map[dDate].drops.push(b);
        }
      }
    });
    return map;
  }, [rows, calendarCarFilter]);

  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth(); // 0-11
    const firstDayIndex = new Date(year, month, 1).getDay(); // 0 (Sun) to 6 (Sat)
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const cells = [];

    // Previous month padding
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      const prevDate = new Date(year, month - 1, d);
      const mStr = String(prevDate.getMonth() + 1).padStart(2, "0");
      const dStr = String(d).padStart(2, "0");
      const dateStr = `${prevDate.getFullYear()}-${mStr}-${dStr}`;
      cells.push({ dayNumber: d, dateStr, isCurrentMonth: false });
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const mStr = String(month + 1).padStart(2, "0");
      const dStr = String(d).padStart(2, "0");
      const dateStr = `${year}-${mStr}-${dStr}`;
      cells.push({ dayNumber: d, dateStr, isCurrentMonth: true });
    }

    // Next month padding (complete to multiple of 7)
    const total = cells.length;
    const remaining = total % 7 === 0 ? 0 : 7 - (total % 7);
    for (let d = 1; d <= remaining; d++) {
      const nextDate = new Date(year, month + 1, d);
      const mStr = String(nextDate.getMonth() + 1).padStart(2, "0");
      const dStr = String(d).padStart(2, "0");
      const dateStr = `${nextDate.getFullYear()}-${mStr}-${dStr}`;
      cells.push({ dayNumber: d, dateStr, isCurrentMonth: false });
    }

    return cells;
  }, [currentMonth]);

  const rawSelectedTransfers = transferDateMap[selectedDate] || { pickups: [], drops: [] };
  const filterQuery = calendarSearch.trim().toLowerCase();

  const selectedPickups = (rawSelectedTransfers.pickups || []).filter((b) => {
    if (!filterQuery) return true;
    return (
      (b.customer_name || "").toLowerCase().includes(filterQuery) ||
      (b.customer_contact || "").toLowerCase().includes(filterQuery) ||
      (b.car_model || "").toLowerCase().includes(filterQuery) ||
      (b.car_registration || "").toLowerCase().includes(filterQuery) ||
      (b.flight_time || "").toLowerCase().includes(filterQuery) ||
      (b.driver_name || "").toLowerCase().includes(filterQuery)
    );
  });

  const selectedDrops = (rawSelectedTransfers.drops || []).filter((b) => {
    if (!filterQuery) return true;
    return (
      (b.customer_name || "").toLowerCase().includes(filterQuery) ||
      (b.customer_contact || "").toLowerCase().includes(filterQuery) ||
      (b.car_model || "").toLowerCase().includes(filterQuery) ||
      (b.car_registration || "").toLowerCase().includes(filterQuery) ||
      (b.flight_time || "").toLowerCase().includes(filterQuery) ||
      (b.driver_name || "").toLowerCase().includes(filterQuery)
    );
  });

  const pickupsRevenue = selectedPickups.reduce((sum, b) => sum + Number(b.transfer_cost || 1000), 0);
  const pickupsDriverCut = selectedPickups.reduce((sum, b) => sum + (b.transfer_handled_by === "driver" ? Number(b.transfer_driver_share || 400) : 0), 0);

  const dropsRevenue = selectedDrops.reduce((sum, b) => sum + Number(b.transfer_cost || 1000), 0);
  const dropsDriverCut = selectedDrops.reduce((sum, b) => sum + (b.transfer_handled_by === "driver" ? Number(b.transfer_driver_share || 400) : 0), 0);

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <AppLayout
      title="Airport Transfers"
      subtitle="Flight pickups & drops tracking, owner self-handling vs driver cut management"
      actions={
        <div className="flex items-center gap-1.5 sm:gap-2">
          <Button
            onClick={() => setNewOpen(true)}
            className="bg-[#20373B] hover:bg-[#2C494E] text-[#FFC64F] font-bold text-[11px] sm:text-xs h-8 sm:h-9 px-2.5 sm:px-4 shadow-xs"
            data-testid="add-transfer-header-button"
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            <span className="hidden sm:inline">Add Airport Transfer</span>
            <span className="sm:hidden">+ Transfer</span>
          </Button>
        </div>
      }
    >
      {/* 4 Responsive Summary Metric Cards (2x2 on phone) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4 mb-4 sm:mb-6">
        <div className="bg-white border border-[#C3E7F1] rounded-xl p-3.5 sm:p-5 shadow-xs">
          <div className="text-[10px] sm:text-[11px] uppercase tracking-wider text-slate-500 font-bold">Total Transfers</div>
          <div className="font-display text-lg sm:text-2xl font-extrabold text-[#20373B] mt-1 sm:mt-2 font-tabular">
            {rows.length}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">Pickups & drops booked</div>
        </div>

        <div className="bg-white border border-emerald-200 bg-emerald-50/20 rounded-xl p-3.5 sm:p-5 shadow-xs">
          <div className="text-[10px] sm:text-[11px] uppercase tracking-wider text-emerald-800 font-bold flex items-center gap-1">
            <User className="w-3 h-3 text-emerald-600" /> Owner Handled
          </div>
          <div className="font-display text-lg sm:text-2xl font-extrabold text-emerald-700 mt-1 sm:mt-2 font-tabular">
            {totalSelfHandled}
          </div>
          <div className="text-[10px] text-emerald-600 mt-0.5">100% kept · Zero driver cut</div>
        </div>

        <div className="bg-white border border-[#C3E7F1] rounded-xl p-3.5 sm:p-5 shadow-xs">
          <div className="text-[10px] sm:text-[11px] uppercase tracking-wider text-slate-500 font-bold">Driver Cuts Paid</div>
          <div className="font-display text-lg sm:text-2xl font-extrabold text-emerald-600 mt-1 sm:mt-2 font-tabular">
            {formatInr(totalDriverPaid)}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">Paid to third-party drivers</div>
        </div>

        <div className={`bg-white border rounded-xl p-3.5 sm:p-5 shadow-xs ${totalDriverPending > 0 ? "border-amber-300 bg-amber-50/20" : "border-[#C3E7F1]"}`}>
          <div className="text-[10px] sm:text-[11px] uppercase tracking-wider text-amber-800 font-bold">Pending Driver Cuts</div>
          <div className="font-display text-lg sm:text-2xl font-extrabold text-amber-900 mt-1 sm:mt-2 font-tabular">
            {formatInr(totalDriverPending)}
          </div>
          <div className="text-[10px] text-amber-700 mt-0.5">Owed to drivers for duties</div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-white border border-[#C3E7F1] p-1 h-auto flex flex-wrap gap-1 rounded-xl shadow-xs">
          <TabsTrigger value="calendar" className="text-xs font-bold py-1.5 px-3 data-[state=active]:bg-[#20373B] data-[state=active]:text-[#FFC64F]">
            📅 Handovers & Returns Calendar (Daily Operations)
          </TabsTrigger>
          <TabsTrigger value="kanban" className="text-xs font-bold py-1.5 px-3 data-[state=active]:bg-[#20373B] data-[state=active]:text-[#FFC64F]">
            📋 Transfer Board (Kanban)
          </TabsTrigger>
          <TabsTrigger value="drivers" className="text-xs font-bold py-1.5 px-3 data-[state=active]:bg-[#20373B] data-[state=active]:text-[#FFC64F]">
            🚕 Driver Cuts & Payout Ledger
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: 📅 INTERACTIVE CALENDAR & SPLIT 2-HALVES VIEW (Pickups vs Drops) */}
        <TabsContent value="calendar" className="mt-0 space-y-5">
          {/* Calendar Controls & Month Grid Card */}
          <div className="bg-white border border-[#C3E7F1] rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
            {/* Top Toolbar: Month navigation + Car selector + Date Jump */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-[#C3E7F1]">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={prevMonth}
                  className="h-8 w-8 p-0 border-[#C3E7F1] text-[#20373B] hover:bg-[#F4FAFC]"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <div className="min-w-[160px] text-center">
                  <h3 className="font-display font-bold text-base sm:text-lg text-[#20373B]">
                    {currentMonth.toLocaleString("default", { month: "long" })} {currentMonth.getFullYear()}
                  </h3>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={nextMonth}
                  className="h-8 w-8 p-0 border-[#C3E7F1] text-[#20373B] hover:bg-[#F4FAFC]"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={goToToday}
                  className="h-8 px-2.5 text-xs font-bold text-[#20373B] border-[#C3E7F1] hover:bg-[#F4FAFC]"
                >
                  Today
                </Button>
              </div>

              {/* Filters: Car Filter + Quick Jump Input + Search */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Vehicle Filter */}
                <div className="w-48 sm:w-56">
                  <Select value={calendarCarFilter} onValueChange={setCalendarCarFilter}>
                    <SelectTrigger className="h-8 text-xs border-[#C3E7F1] bg-[#F4FAFC]">
                      <SelectValue placeholder="All Fleet Vehicles" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">🚗 All Fleet Vehicles</SelectItem>
                      {carsList.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.model} ({c.registration_no})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Direct Date Picker Jump */}
                <div className="flex items-center gap-1 bg-[#F4FAFC] border border-[#C3E7F1] rounded-lg px-2 h-8">
                  <CalendarDays className="w-3.5 h-3.5 text-[#519CAB]" />
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => {
                      if (e.target.value) {
                        setSelectedDate(e.target.value);
                        setCurrentMonth(new Date(e.target.value + "T12:00:00"));
                      }
                    }}
                    className="bg-transparent text-xs text-[#20373B] font-tabular outline-none cursor-pointer"
                    title="Jump to date"
                  />
                </div>

                {/* Quick text filter */}
                <div className="relative w-40 sm:w-48">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                  <Input
                    value={calendarSearch}
                    onChange={(e) => setCalendarSearch(e.target.value)}
                    placeholder="Search passenger..."
                    className="h-8 pl-8 text-xs border-[#C3E7F1] bg-[#F4FAFC]"
                  />
                </div>
              </div>
            </div>

            {/* Calendar Weekday Names */}
            <div className="grid grid-cols-7 gap-1 sm:gap-1.5 text-center text-[11px] font-bold uppercase tracking-wider text-slate-400 pb-1">
              <div>Sun</div>
              <div>Mon</div>
              <div>Tue</div>
              <div>Wed</div>
              <div>Thu</div>
              <div>Fri</div>
              <div>Sat</div>
            </div>

            {/* Calendar Days Grid */}
            <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
              {calendarDays.map((cell, idx) => {
                const isSelected = cell.dateStr === selectedDate;
                const isToday = cell.dateStr === todayStr;
                const dayData = transferDateMap[cell.dateStr] || { pickups: [], drops: [] };
                const dayPickupsCount = dayData.pickups.length;
                const dayDropsCount = dayData.drops.length;

                return (
                  <button
                    key={`${cell.dateStr}-${idx}`}
                    type="button"
                    onClick={() => {
                      setSelectedDate(cell.dateStr);
                      if (!cell.isCurrentMonth) {
                        setCurrentMonth(new Date(cell.dateStr + "T12:00:00"));
                      }
                    }}
                    className={`min-h-[58px] sm:min-h-[66px] p-1 sm:p-1.5 rounded-xl text-left flex flex-col justify-between transition-all cursor-pointer border ${
                      isSelected
                        ? "bg-[#20373B] text-white border-[#20373B] shadow-md ring-2 ring-[#FFC64F]"
                        : isToday
                        ? "bg-[#F4FAFC] border-2 border-[#519CAB] text-[#20373B]"
                        : cell.isCurrentMonth
                        ? "bg-white border-slate-200 hover:border-[#519CAB] hover:bg-[#F4FAFC]/60 text-[#20373B]"
                        : "bg-slate-50/60 border-slate-100 text-slate-300 hover:text-slate-500"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span
                        className={`text-xs font-bold ${
                          isSelected ? "text-[#FFC64F]" : isToday ? "text-[#519CAB]" : ""
                        }`}
                      >
                        {cell.dayNumber}
                      </span>
                      {isToday && (
                        <span
                          className={`text-[9px] px-1 py-0.2 rounded font-bold uppercase ${
                            isSelected ? "bg-[#FFC64F] text-[#20373B]" : "bg-[#519CAB] text-white"
                          }`}
                        >
                          Today
                        </span>
                      )}
                    </div>

                    {/* Transfer badges */}
                    <div className="space-y-0.5 w-full mt-1">
                      {dayPickupsCount > 0 && (
                        <div
                          className={`text-[9px] sm:text-[10px] leading-tight px-1 py-0.5 rounded font-bold truncate flex items-center gap-0.5 ${
                            isSelected
                              ? "bg-emerald-500/30 text-emerald-200 border border-emerald-400/40"
                              : "bg-emerald-50 text-emerald-800 border border-emerald-200"
                          }`}
                          title={`${dayPickupsCount} Car Handover${dayPickupsCount > 1 ? "s" : ""} (Giving car)`}
                        >
                          <span>🚗</span>
                          <span>{dayPickupsCount}</span>
                          <span className="hidden sm:inline">Handover</span>
                        </div>
                      )}
                      {dayDropsCount > 0 && (
                        <div
                          className={`text-[9px] sm:text-[10px] leading-tight px-1 py-0.5 rounded font-bold truncate flex items-center gap-0.5 ${
                            isSelected
                              ? "bg-amber-500/30 text-amber-200 border border-amber-400/40"
                              : "bg-amber-50 text-amber-800 border border-amber-200"
                          }`}
                          title={`${dayDropsCount} Car Return${dayDropsCount > 1 ? "s" : ""} (Collecting car)`}
                        >
                          <span>🔄</span>
                          <span>{dayDropsCount}</span>
                          <span className="hidden sm:inline">Return</span>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected Date Header & Financial Stats Bar */}
          <div className="p-4 bg-[#F4FAFC] border border-[#C3E7F1] rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-2xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#20373B] text-[#FFC64F] flex items-center justify-center font-bold text-lg shadow-xs shrink-0">
                📅
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-display font-bold text-base sm:text-lg text-[#20373B]">
                    {new Date(selectedDate + "T12:00:00").toLocaleDateString("en-IN", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </h2>
                  {selectedDate === todayStr && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold border border-emerald-300">
                      Today's Live Duties
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Showing all scheduled airport transfers for this selected date. Click on either column to review details or update drivers.
                </p>
              </div>
            </div>

            {/* Quick Metrics */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <div className="bg-white border border-emerald-200 px-3 py-1.5 rounded-xl shadow-2xs">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block">Handovers (Give Car)</span>
                <span className="font-bold text-emerald-800 text-sm">{selectedPickups.length} Handover{selectedPickups.length !== 1 ? "s" : ""}</span>
              </div>
              <div className="bg-white border border-amber-200 px-3 py-1.5 rounded-xl shadow-2xs">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block">Returns (Collect Car)</span>
                <span className="font-bold text-amber-800 text-sm">{selectedDrops.length} Return{selectedDrops.length !== 1 ? "s" : ""}</span>
              </div>
              <div className="bg-white border border-[#C3E7F1] px-3 py-1.5 rounded-xl shadow-2xs">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block">Day Collections</span>
                <span className="font-bold text-[#20373B] text-sm">{formatInr(pickupsRevenue + dropsRevenue)}</span>
              </div>
            </div>
          </div>

          {/* SPLIT TWO-HALVES VIEW: Handovers (Left) vs Returns (Right) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* FIRST HALF: 🚗 CAR HANDOVERS / GIVING CAR TO CLIENT */}
            <div className="bg-white border-2 border-emerald-200/80 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-emerald-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center font-bold text-base">
                    🚗
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-display font-bold text-base text-[#20373B]">Car Handovers (Give Car)</h3>
                      <span className="text-xs font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                        {selectedPickups.length}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Giving car to client (Start of trip) · Revenue: {formatInr(pickupsRevenue)}
                    </p>
                  </div>
                </div>

                <Button
                  size="sm"
                  onClick={() => openNewForDate(selectedDate, "airport_pickup")}
                  className="h-8 px-2.5 text-xs font-bold bg-[#20373B] hover:bg-[#2C494E] text-[#FFC64F] shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add Handover
                </Button>
              </div>

              {/* Duty Cards List */}
              <div className="space-y-3 flex-1 overflow-y-auto max-h-[750px] pr-1">
                {selectedPickups.map((b) => (
                  <DutyItemCard
                    key={b.id}
                    booking={b}
                    dutyType="pickup"
                    openEdit={openEdit}
                    sendDriverWhatsApp={sendDriverWhatsApp}
                    toggleSplitPayment={toggleSplitPayment}
                    setStatus={setStatus}
                  />
                ))}

                {selectedPickups.length === 0 && (
                  <div className="p-8 text-center bg-[#F4FAFC] rounded-xl border border-dashed border-[#C3E7F1] space-y-2 my-auto">
                    <div className="text-3xl">🚗</div>
                    <div className="font-bold text-xs text-[#20373B]">
                      No Car Handovers on {formatDate(selectedDate)}
                    </div>
                    <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                      No car deliveries / handovers scheduled for this date {calendarCarFilter !== "all" ? "for the selected car" : ""}.
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openNewForDate(selectedDate, "airport_pickup")}
                      className="text-xs text-[#519CAB] border-[#C3E7F1] hover:bg-white"
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" /> Schedule Handover
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* SECOND HALF: 🔄 CAR RETURNS / COLLECTING CAR FROM CLIENT */}
            <div className="bg-white border-2 border-amber-200/80 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-amber-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 flex items-center justify-center font-bold text-base">
                    🔄
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-display font-bold text-base text-[#20373B]">Car Returns (Collect Car)</h3>
                      <span className="text-xs font-extrabold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                        {selectedDrops.length}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Collecting car back (End of trip) · Revenue: {formatInr(dropsRevenue)}
                    </p>
                  </div>
                </div>

                <Button
                  size="sm"
                  onClick={() => openNewForDate(selectedDate, "airport_drop")}
                  className="h-8 px-2.5 text-xs font-bold bg-[#20373B] hover:bg-[#2C494E] text-[#FFC64F] shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add Return
                </Button>
              </div>

              {/* Duty Cards List */}
              <div className="space-y-3 flex-1 overflow-y-auto max-h-[750px] pr-1">
                {selectedDrops.map((b) => (
                  <DutyItemCard
                    key={b.id}
                    booking={b}
                    dutyType="drop"
                    openEdit={openEdit}
                    sendDriverWhatsApp={sendDriverWhatsApp}
                    toggleSplitPayment={toggleSplitPayment}
                    setStatus={setStatus}
                  />
                ))}

                {selectedDrops.length === 0 && (
                  <div className="p-8 text-center bg-[#F4FAFC] rounded-xl border border-dashed border-[#C3E7F1] space-y-2 my-auto">
                    <div className="text-3xl">🔄</div>
                    <div className="font-bold text-xs text-[#20373B]">
                      No Car Returns on {formatDate(selectedDate)}
                    </div>
                    <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                      No car returns / collections scheduled for this date {calendarCarFilter !== "all" ? "for the selected car" : ""}.
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openNewForDate(selectedDate, "airport_drop")}
                      className="text-xs text-[#519CAB] border-[#C3E7F1] hover:bg-white"
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" /> Schedule Return
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* TAB 2: KANBAN BOARD */}
        <TabsContent value="kanban" className="mt-0">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {stages.map((s) => (
              <div key={s.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3 sm:p-4 flex flex-col">
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <span className="font-display font-bold text-xs uppercase tracking-wider text-[#20373B]">
                      {s.label}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white border border-slate-200 text-[#20373B]">
                      {grouped[s.id].length}
                    </span>
                  </div>
                </div>

                <div className="space-y-3 flex-1 overflow-y-auto max-h-[calc(100vh-280px)] pr-1">
                  {grouped[s.id].map((b) => {
                    const isSelf = b.transfer_handled_by === "self" || b.driver_name === "Owner (Self)";
                    const dFee = Number(b.driver_fee || b.transfer_driver_share || 0);

                    return (
                      <Card
                        key={b.id}
                        className="p-3.5 bg-white border border-[#C3E7F1] shadow-xs rounded-xl hover:border-[#519CAB] transition-all space-y-2.5"
                      >
                        {/* Customer & Route Header */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-[#20373B] text-sm truncate flex items-center gap-1.5">
                              <span>{b.customer_name}</span>
                            </div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                              <Phone className="w-3 h-3" />
                              <span>{b.customer_contact || "No phone"}</span>
                            </div>
                          </div>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 shrink-0">
                            {b.transfer_type === "airport_pickup" ? "🛬 Pickup" : b.transfer_type === "airport_drop" ? "🛫 Drop" : "🔄 Both"}
                          </span>
                        </div>

                        {/* Vehicle & Flight details */}
                        <div className="p-2 rounded-lg bg-[#F4FAFC] border border-[#C3E7F1]/60 text-xs space-y-1">
                          <div className="flex items-center justify-between text-slate-700">
                            <span className="font-medium flex items-center gap-1">
                              <Car className="w-3 h-3 text-[#519CAB]" />
                              {b.car_model || "Car"}
                            </span>
                            <span className="font-mono text-[11px] text-[#519CAB] font-semibold">{b.car_registration || "Fleet"}</span>
                          </div>
                          {b.flight_time && (
                            <div className="text-[11px] text-slate-600 flex items-center gap-1">
                              <Plane className="w-3 h-3 text-slate-400" />
                              <strong className="text-slate-800">Flight:</strong> {b.flight_time}
                            </div>
                          )}
                          {b.transfer_pickup_point && (
                            <div className="text-[10px] text-slate-500 truncate">
                              📍 {b.transfer_pickup_point}
                            </div>
                          )}
                        </div>

                        {/* Transfer Handling & Cut Distribution Banner */}
                        {isSelf ? (
                          <div className="p-2.5 rounded-lg bg-emerald-50/90 border border-emerald-200 flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5 font-bold text-emerald-900">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span>Handled by Owner (Self)</span>
                            </div>
                            <span className="text-[10px] font-extrabold text-emerald-800 bg-white px-2 py-0.5 rounded border border-emerald-200 font-tabular shrink-0">
                              100% Kept: {formatInr(b.transfer_cost || 1000)}
                            </span>
                          </div>
                        ) : (
                          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5">
                            <div className="flex items-center justify-between text-[11px] font-bold text-[#20373B]">
                              <span>Driver Cut Basis:</span>
                              <span className="font-tabular text-[#519CAB]">Total: {formatInr(b.transfer_cost || 1000)}</span>
                            </div>

                            <div className="grid grid-cols-2 gap-2 pt-0.5">
                              {/* Driver Cut Share */}
                              <div className="bg-white p-2 rounded-md border border-[#C3E7F1]/80 space-y-1">
                                <div className="flex items-center justify-between text-[10px] text-slate-500 font-semibold uppercase">
                                  <span className="truncate">🚕 {b.driver_name || "Driver"}</span>
                                  <span className="font-tabular font-bold text-[#20373B] shrink-0">{formatInr(b.transfer_driver_share || 400)}</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => toggleSplitPayment(b, "transfer_driver_paid", b.transfer_driver_paid)}
                                  className={`w-full py-0.5 rounded text-[10px] font-bold border transition-colors cursor-pointer ${
                                    b.transfer_driver_paid
                                      ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                                      : "bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100"
                                  }`}
                                >
                                  {b.transfer_driver_paid ? "✅ Cut Paid" : "⏳ Cut Pending"}
                                </button>
                              </div>

                              {/* Manoj / Owner Share */}
                              <div className="bg-white p-2 rounded-md border border-[#C3E7F1]/80 space-y-1">
                                <div className="flex items-center justify-between text-[10px] text-slate-500 font-semibold uppercase">
                                  <span className="truncate">💼 Owner Share</span>
                                  <span className="font-tabular font-bold text-[#20373B] shrink-0">{formatInr(b.transfer_manoj_share || 600)}</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => toggleSplitPayment(b, "transfer_manoj_paid", b.transfer_manoj_paid)}
                                  className={`w-full py-0.5 rounded text-[10px] font-bold border transition-colors cursor-pointer ${
                                    b.transfer_manoj_paid
                                      ? "bg-blue-50 text-blue-800 border-blue-300"
                                      : "bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100"
                                  }`}
                                >
                                  {b.transfer_manoj_paid ? "✅ Received" : "⏳ Pending"}
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Action buttons */}
                        <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-slate-100">
                          <div className="flex items-center gap-1">
                            {!isSelf && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => sendDriverWhatsApp(b)}
                                className="h-7 px-2 text-[11px] font-bold border-emerald-300 text-emerald-700 hover:bg-emerald-50 shrink-0"
                                title="Send duty details to driver via WhatsApp"
                              >
                                <MessageSquare className="w-3 h-3 mr-1 text-emerald-600" /> Dispatch
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEdit(b)}
                              className="h-7 px-2 text-[11px] text-[#519CAB] hover:bg-[#C3E7F1]/30 font-semibold"
                            >
                              <Edit3 className="w-3 h-3 mr-1" /> Edit Cut
                            </Button>
                          </div>

                          {/* Pipeline stage moves */}
                          <div className="flex gap-1">
                            {stages.filter((x) => x.id !== s.id).map((x) => (
                              <Button
                                key={x.id}
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-[10px] bg-slate-50 hover:bg-white"
                                onClick={() => setStatus(b.id, x.id)}
                              >
                                → {x.label}
                              </Button>
                            ))}
                          </div>
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

        {/* TAB 2: DRIVER CUTS & PAYOUT LEDGER */}
        <TabsContent value="drivers" className="mt-0">
          <div className="bg-white border border-[#C3E7F1] rounded-xl overflow-hidden shadow-xs">
            <div className="p-4 border-b border-[#C3E7F1] bg-[#F4FAFC] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="font-display font-bold text-[#20373B] text-sm">
                  Driver Cut Settlement Ledger
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Detailed breakdown of duties, agreed driver cuts, settled payments, and pending dues.
                </p>
              </div>
              <div className="text-xs font-semibold text-[#519CAB]">
                {summaryData.drivers.length} Driver(s) / Person(s)
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#F4FAFC] text-[11px] uppercase tracking-wider text-[#20373B]/70 border-b border-[#C3E7F1]">
                  <tr>
                    <th className="text-left px-5 py-3 font-bold">Driver / Person Name</th>
                    <th className="text-center px-5 py-3 font-bold">Duties Handled</th>
                    <th className="text-right px-5 py-3 font-bold">Total Agreed Cut</th>
                    <th className="text-right px-5 py-3 font-bold">Paid to Driver</th>
                    <th className="text-right px-5 py-3 font-bold">Pending Due</th>
                    <th className="text-center px-5 py-3 font-bold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#C3E7F1]/50">
                  {summaryData.drivers.map((d) => {
                    const isSelf = d.driver_name.toLowerCase().includes("owner") || d.is_self;
                    return (
                      <tr key={d.driver_name} className="hover:bg-[#C3E7F1]/20 transition-colors">
                        <td className="px-5 py-3.5 font-semibold text-[#20373B] flex items-center gap-2.5">
                          <div className={`w-8 h-8 rounded-full border flex items-center justify-center text-xs font-bold shrink-0 ${
                            isSelf ? "bg-emerald-50 border-emerald-300 text-emerald-800" : "bg-[#C3E7F1]/40 border-[#C3E7F1] text-[#20373B]"
                          }`}>
                            {isSelf ? "👤" : "🚕"}
                          </div>
                          <div>
                            <div>{d.driver_name}</div>
                            {isSelf ? (
                              <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                                100% Kept by Owner · Zero Payout
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400 font-normal">
                                External Driver on Cut Basis
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-center font-tabular font-medium text-slate-700">{d.total_transfers}</td>
                        <td className="px-5 py-3.5 text-right font-tabular font-bold text-slate-900">{formatInr(d.total_fee)}</td>
                        <td className="px-5 py-3.5 text-right font-tabular font-bold text-emerald-600">{formatInr(d.total_paid)}</td>
                        <td className={`px-5 py-3.5 text-right font-tabular font-bold ${d.total_pending > 0 ? "text-amber-900" : "text-slate-500"}`}>
                          {formatInr(d.total_pending)}
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          {isSelf ? (
                            <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold inline-flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> In-House
                            </span>
                          ) : d.total_pending > 0 ? (
                            <span className="text-xs px-2.5 py-1 rounded-full bg-amber-50 text-amber-900 border border-amber-300 font-bold inline-flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5 text-amber-700" /> Pending {formatInr(d.total_pending)}
                            </span>
                          ) : (
                            <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold inline-flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Fully Settled
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
          </div>
        </TabsContent>
      </Tabs>

      {/* ADD NEW AIRPORT TRANSFER MODAL */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="w-[96vw] sm:max-w-lg max-h-[90dvh] overflow-y-auto p-4 sm:p-6 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#20373B] text-lg font-bold">
              <div className="w-8 h-8 rounded-full bg-[#C3E7F1] flex items-center justify-center text-[#20373B]">
                <Plane className="w-4 h-4" />
              </div>
              Add New Airport Transfer
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            {/* Customer info */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Customer Name</Label>
                <Input
                  value={newForm.customer_name}
                  onChange={(e) => setNewForm({ ...newForm, customer_name: e.target.value })}
                  placeholder="e.g. Vikram Sharma"
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Contact Phone</Label>
                <Input
                  value={newForm.customer_contact}
                  onChange={(e) => setNewForm({ ...newForm, customer_contact: e.target.value })}
                  placeholder="+91 98765 43210"
                  className="h-9"
                />
              </div>
            </div>

            {/* Select Car */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Select Vehicle / Car</Label>
              <Select
                value={newForm.car_id}
                onValueChange={(val) => setNewForm({ ...newForm, car_id: val })}
              >
                <SelectTrigger className="h-9"><SelectValue placeholder="Select a car..." /></SelectTrigger>
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
                <Label className="text-xs font-semibold">Transfer Type</Label>
                <Select
                  value={newForm.transfer_type}
                  onValueChange={(val) => {
                    const cost = val === "both" ? "2000" : "1000";
                    setNewForm({
                      ...newForm,
                      transfer_type: val,
                      transfer_cost: cost,
                      transfer_manoj_share: newForm.transfer_handled_by === "self" ? cost : String(Math.max(0, Number(cost) - Number(newForm.transfer_driver_share || 0))),
                    });
                  }}
                >
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="airport_drop">Airport Drop</SelectItem>
                    <SelectItem value="airport_pickup">Airport Pickup</SelectItem>
                    <SelectItem value="both">Both Pickup & Drop</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Transfer Date</Label>
                <Input
                  type="date"
                  value={newForm.start_date}
                  onChange={(e) => setNewForm({ ...newForm, start_date: e.target.value, end_date: e.target.value })}
                  className="h-9"
                />
              </div>
            </div>

            {/* Flight details & Pickup Point */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Flight Details / Time</Label>
                <Input
                  value={newForm.flight_time}
                  onChange={(e) => setNewForm({ ...newForm, flight_time: e.target.value })}
                  placeholder="e.g. 14:30 AI-671"
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Airport Terminal / Point</Label>
                <Input
                  value={newForm.transfer_pickup_point}
                  onChange={(e) => setNewForm({ ...newForm, transfer_pickup_point: e.target.value })}
                  placeholder="e.g. MOPA Terminal 1"
                  className="h-9"
                />
              </div>
            </div>

            {/* WHO HANDLES THE TRANSFER? (1-Click Toggle) */}
            <div className="space-y-2 pt-1">
              <Label className="text-xs font-bold text-[#20373B]">Who Handles This Transfer?</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const cost = Number(newForm.transfer_cost || 1000);
                    setNewForm({
                      ...newForm,
                      transfer_handled_by: "self",
                      driver_name: "Owner (Self)",
                      driver_contact: "",
                      transfer_driver_share: "0",
                      transfer_manoj_share: String(cost),
                      transfer_driver_paid: true,
                    });
                  }}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    newForm.transfer_handled_by === "self"
                      ? "bg-emerald-50 border-emerald-500 text-emerald-950 font-bold shadow-xs ring-1 ring-emerald-400"
                      : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <User className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-bold">Owner (Self)</span>
                  </div>
                  <div className="text-[10px] text-emerald-700 mt-1 font-medium leading-tight">
                    100% kept by owner · No driver cut
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const cost = Number(newForm.transfer_cost || 1000);
                    const cut = 400;
                    setNewForm({
                      ...newForm,
                      transfer_handled_by: "driver",
                      driver_name: newForm.driver_name === "Owner (Self)" ? "" : newForm.driver_name,
                      transfer_driver_share: String(cut),
                      transfer_manoj_share: String(Math.max(0, cost - cut)),
                      transfer_driver_paid: false,
                    });
                  }}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    newForm.transfer_handled_by === "driver"
                      ? "bg-blue-50 border-blue-500 text-blue-950 font-bold shadow-xs ring-1 ring-blue-400"
                      : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <Car className="w-4 h-4 text-blue-600" />
                    <span className="text-xs font-bold">Driver on Cut Basis</span>
                  </div>
                  <div className="text-[10px] text-blue-700 mt-1 font-medium leading-tight">
                    Custom cut to driver · Rest to owner
                  </div>
                </button>
              </div>
            </div>

            {/* Total Charge & Cut Inputs */}
            <div className="p-3.5 rounded-xl bg-[#F4FAFC] border border-[#C3E7F1] space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-[#20373B]">Transfer Pricing & Cut Split</Label>
                <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-600">
                  <span>Total Rate: ₹</span>
                  <input
                    type="number"
                    value={newForm.transfer_cost}
                    onChange={(e) => {
                      const cost = Number(e.target.value || 0);
                      const cut = Number(newForm.transfer_driver_share || 0);
                      setNewForm({
                        ...newForm,
                        transfer_cost: e.target.value,
                        transfer_manoj_share: String(Math.max(0, cost - cut)),
                      });
                    }}
                    className="w-16 h-6 px-1.5 bg-white border border-[#C3E7F1] rounded text-xs font-bold font-tabular text-[#20373B]"
                  />
                </div>
              </div>

              {newForm.transfer_handled_by === "driver" ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[11px] font-semibold text-slate-700">Driver / Cab Person Name</Label>
                      <Input
                        value={newForm.driver_name === "Owner (Self)" ? "" : newForm.driver_name}
                        onChange={(e) => setNewForm({ ...newForm, driver_name: e.target.value })}
                        placeholder="e.g. Suresh / Deepak"
                        className="h-8 bg-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] font-semibold text-slate-700">Driver WhatsApp Phone</Label>
                      <Input
                        value={newForm.driver_contact}
                        onChange={(e) => setNewForm({ ...newForm, driver_contact: e.target.value })}
                        placeholder="+91 98221..."
                        className="h-8 bg-white"
                      />
                    </div>
                  </div>

                  {/* Quick cut presets */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] text-slate-600 font-semibold">
                      <span>Quick Cut Presets:</span>
                      <span className="text-amber-800 font-bold">Driver gets ₹{newForm.transfer_driver_share}</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {["300", "400", "500", "600"].map((cut) => (
                        <button
                          key={cut}
                          type="button"
                          onClick={() => {
                            const cost = Number(newForm.transfer_cost || 1000);
                            setNewForm({
                              ...newForm,
                              transfer_driver_share: cut,
                              transfer_manoj_share: String(Math.max(0, cost - Number(cut))),
                            });
                          }}
                          className={`px-2 py-0.5 rounded text-[11px] font-semibold border transition-all cursor-pointer ${
                            newForm.transfer_driver_share === cut
                              ? "bg-blue-600 text-white border-blue-600 font-bold"
                              : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                          }`}
                        >
                          ₹{cut} Cut
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Cut inputs */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div className="bg-white p-2.5 rounded-lg border border-amber-200">
                      <div className="text-[10px] text-amber-800 font-bold uppercase">Driver Cut Amount (₹)</div>
                      <Input
                        type="number"
                        value={newForm.transfer_driver_share}
                        onChange={(e) => {
                          const cut = Number(e.target.value || 0);
                          const cost = Number(newForm.transfer_cost || 1000);
                          setNewForm({
                            ...newForm,
                            transfer_driver_share: e.target.value,
                            transfer_manoj_share: String(Math.max(0, cost - cut)),
                          });
                        }}
                        className="h-8 font-bold font-tabular text-amber-950 mt-1 text-sm"
                      />
                    </div>

                    <div className="bg-white p-2.5 rounded-lg border border-emerald-200">
                      <div className="text-[10px] text-emerald-800 font-bold uppercase">Manoj / Owner Retains (₹)</div>
                      <div className="h-8 flex items-center font-bold font-tabular text-emerald-900 text-base mt-1 px-2 bg-emerald-50/50 rounded border border-emerald-100">
                        {formatInr(newForm.transfer_manoj_share || 0)}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200 text-emerald-950 text-xs">
                  ✅ <strong>Full Retention:</strong> 100% of this ₹{newForm.transfer_cost} airport transfer is retained directly by Car Castle / Owner with zero driver payout liability.
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Notes (Optional)</Label>
              <Textarea
                value={newForm.notes}
                onChange={(e) => setNewForm({ ...newForm, notes: e.target.value })}
                placeholder="Special pickup instructions..."
                rows={2}
                className="text-xs"
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
        <DialogContent className="w-[96vw] sm:max-w-lg max-h-[90dvh] overflow-y-auto p-4 sm:p-6 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#20373B] text-lg font-bold">
              <div className="w-8 h-8 rounded-full bg-[#C3E7F1] flex items-center justify-center text-[#20373B]">
                <Edit3 className="w-4 h-4" />
              </div>
              Edit Driver & Cut Distribution
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            {selectedBooking && (
              <div className="p-3 bg-[#F4FAFC] border border-[#C3E7F1] rounded-xl space-y-1 text-slate-700">
                <div className="font-bold text-[#20373B] text-sm">{selectedBooking.customer_name} ({selectedBooking.customer_contact})</div>
                <div className="text-xs">
                  <strong>Vehicle:</strong> {selectedBooking.car_model} · <span className="font-mono text-[#519CAB] font-semibold">{selectedBooking.car_registration}</span>
                </div>
              </div>
            )}

            {/* WHO HANDLES THE TRANSFER? (1-Click Toggle) */}
            <div className="space-y-2">
              <Label className="text-xs font-bold text-[#20373B]">Who Handles This Transfer?</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const cost = Number(form.transfer_cost || 1000);
                    setForm({
                      ...form,
                      transfer_handled_by: "self",
                      driver_name: "Owner (Self)",
                      driver_contact: "",
                      transfer_driver_share: "0",
                      transfer_manoj_share: String(cost),
                      transfer_driver_paid: true,
                    });
                  }}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    form.transfer_handled_by === "self"
                      ? "bg-emerald-50 border-emerald-500 text-emerald-950 font-bold shadow-xs ring-1 ring-emerald-400"
                      : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <User className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-bold">Owner (Self)</span>
                  </div>
                  <div className="text-[10px] text-emerald-700 mt-1 font-medium leading-tight">
                    100% kept by owner · No driver cut
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const cost = Number(form.transfer_cost || 1000);
                    const cut = 400;
                    setForm({
                      ...form,
                      transfer_handled_by: "driver",
                      driver_name: form.driver_name === "Owner (Self)" ? "" : form.driver_name,
                      transfer_driver_share: String(cut),
                      transfer_manoj_share: String(Math.max(0, cost - cut)),
                      transfer_driver_paid: false,
                    });
                  }}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    form.transfer_handled_by === "driver"
                      ? "bg-blue-50 border-blue-500 text-blue-950 font-bold shadow-xs ring-1 ring-blue-400"
                      : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <Car className="w-4 h-4 text-blue-600" />
                    <span className="text-xs font-bold">Driver on Cut Basis</span>
                  </div>
                  <div className="text-[10px] text-blue-700 mt-1 font-medium leading-tight">
                    Custom cut to driver · Rest to owner
                  </div>
                </button>
              </div>
            </div>

            {/* Total Charge & Cut Inputs */}
            <div className="p-3.5 rounded-xl bg-[#F4FAFC] border border-[#C3E7F1] space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-[#20373B]">Transfer Pricing & Cut Split</Label>
                <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-600">
                  <span>Total Rate: ₹</span>
                  <input
                    type="number"
                    value={form.transfer_cost}
                    onChange={(e) => {
                      const cost = Number(e.target.value || 0);
                      const cut = Number(form.transfer_driver_share || 0);
                      setForm({
                        ...form,
                        transfer_cost: e.target.value,
                        transfer_manoj_share: String(Math.max(0, cost - cut)),
                      });
                    }}
                    className="w-16 h-6 px-1.5 bg-white border border-[#C3E7F1] rounded text-xs font-bold font-tabular text-[#20373B]"
                  />
                </div>
              </div>

              {form.transfer_handled_by === "driver" ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[11px] font-semibold text-slate-700">Driver / Cab Person Name</Label>
                      <Input
                        value={form.driver_name === "Owner (Self)" ? "" : form.driver_name}
                        onChange={(e) => setForm({ ...form, driver_name: e.target.value })}
                        placeholder="e.g. Suresh / Deepak"
                        className="h-8 bg-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] font-semibold text-slate-700">Driver WhatsApp Phone</Label>
                      <Input
                        value={form.driver_contact}
                        onChange={(e) => setForm({ ...form, driver_contact: e.target.value })}
                        placeholder="+91 98221..."
                        className="h-8 bg-white"
                      />
                    </div>
                  </div>

                  {/* Quick cut presets */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] text-slate-600 font-semibold">
                      <span>Quick Cut Presets:</span>
                      <span className="text-amber-800 font-bold">Driver gets ₹{form.transfer_driver_share}</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {["300", "400", "500", "600"].map((cut) => (
                        <button
                          key={cut}
                          type="button"
                          onClick={() => {
                            const cost = Number(form.transfer_cost || 1000);
                            setForm({
                              ...form,
                              transfer_driver_share: cut,
                              transfer_manoj_share: String(Math.max(0, cost - Number(cut))),
                            });
                          }}
                          className={`px-2 py-0.5 rounded text-[11px] font-semibold border transition-all cursor-pointer ${
                            form.transfer_driver_share === cut
                              ? "bg-blue-600 text-white border-blue-600 font-bold"
                              : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                          }`}
                        >
                          ₹{cut} Cut
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Cut inputs */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div className="bg-white p-2.5 rounded-lg border border-amber-200">
                      <div className="text-[10px] text-amber-800 font-bold uppercase">Driver Cut Amount (₹)</div>
                      <Input
                        type="number"
                        value={form.transfer_driver_share}
                        onChange={(e) => {
                          const cut = Number(e.target.value || 0);
                          const cost = Number(form.transfer_cost || 1000);
                          setForm({
                            ...form,
                            transfer_driver_share: e.target.value,
                            transfer_manoj_share: String(Math.max(0, cost - cut)),
                          });
                        }}
                        className="h-8 font-bold font-tabular text-amber-950 mt-1 text-sm"
                      />
                    </div>

                    <div className="bg-white p-2.5 rounded-lg border border-emerald-200">
                      <div className="text-[10px] text-emerald-800 font-bold uppercase">Manoj / Owner Retains (₹)</div>
                      <div className="h-8 flex items-center font-bold font-tabular text-emerald-900 text-base mt-1 px-2 bg-emerald-50/50 rounded border border-emerald-100">
                        {formatInr(form.transfer_manoj_share || 0)}
                      </div>
                    </div>
                  </div>

                  {/* Payment settlement switches */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <label className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.transfer_driver_paid}
                        onChange={(e) => setForm({ ...form, transfer_driver_paid: e.target.checked })}
                        className="w-4 h-4 rounded text-emerald-600"
                      />
                      <span className={`text-xs font-bold ${form.transfer_driver_paid ? "text-emerald-700" : "text-slate-600"}`}>
                        {form.transfer_driver_paid ? "✅ Driver Cut Paid" : "⏳ Driver Cut Pending"}
                      </span>
                    </label>

                    <label className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.transfer_manoj_paid}
                        onChange={(e) => setForm({ ...form, transfer_manoj_paid: e.target.checked })}
                        className="w-4 h-4 rounded text-blue-600"
                      />
                      <span className={`text-xs font-bold ${form.transfer_manoj_paid ? "text-blue-700" : "text-slate-600"}`}>
                        {form.transfer_manoj_paid ? "✅ Manoj Cut Received" : "⏳ Manoj Cut Pending"}
                      </span>
                    </label>
                  </div>

                  {/* 1-Click WhatsApp Dispatch Button */}
                  {selectedBooking && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => sendDriverWhatsApp({
                        ...selectedBooking,
                        driver_contact: form.driver_contact,
                        transfer_driver_share: form.transfer_driver_share,
                        flight_time: form.flight_time,
                        transfer_pickup_point: form.transfer_pickup_point,
                      })}
                      className="w-full border-emerald-300 text-emerald-700 hover:bg-emerald-50 font-bold h-9 text-xs"
                    >
                      <MessageSquare className="w-4 h-4 mr-1.5 text-emerald-600" />
                      Dispatch Duty via WhatsApp to {form.driver_name || "Driver"}
                    </Button>
                  )}
                </div>
              ) : (
                <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200 text-emerald-950 text-xs">
                  ✅ <strong>Full Retention:</strong> Handled by Owner (Self). 100% of the ₹{form.transfer_cost} transfer charge is retained by you with zero driver payout liability.
                </div>
              )}
            </div>

            {/* Flight & Pipeline info */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Flight Time / Details</Label>
                <Input
                  value={form.flight_time}
                  onChange={(e) => setForm({ ...form, flight_time: e.target.value })}
                  placeholder="e.g. 18:30 6E-204"
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Airport Terminal / Pickup</Label>
                <Input
                  value={form.transfer_pickup_point}
                  onChange={(e) => setForm({ ...form, transfer_pickup_point: e.target.value })}
                  placeholder="e.g. MOPA Terminal 1"
                  className="h-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Transfer Stage</Label>
              <Select
                value={form.transfer_status}
                onValueChange={(val) => setForm({ ...form, transfer_status: val })}
              >
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="en_route">En Route</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
                placeholder="Specific instructions..."
                className="text-xs"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={saveDriverUpdate} disabled={saving} className="bg-[#20373B] hover:bg-[#2C494E] text-[#FFC64F] font-bold">
              {saving ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

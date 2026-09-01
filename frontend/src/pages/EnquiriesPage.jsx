import React, { useState, useEffect, useCallback } from "react";
import AppLayout from "@/components/AppLayout";
import CityDropdown from "@/components/CityDropdown";
import { api, formatDate, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import {
  Plus,
  Search,
  Calendar,
  Filter,
  PieChart as PieIcon,
  FileSpreadsheet,
  FileText,
  Phone,
  Mail,
  MapPin,
  Car,
  MessageSquare,
  Edit2,
  Trash2,
  CheckCircle2,
  Clock,
  UserCheck,
  XCircle,
  HelpCircle,
  TrendingUp,
  Download,
  Loader2,
  X,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";
import { exportPdf } from "@/utils/exportPdf";
import { exportExcel } from "@/utils/exportExcel";

const STATUS_CONFIG = {
  new: {
    label: "New Lead",
    bg: "bg-blue-50 text-blue-700 border-blue-200",
    dot: "bg-blue-500",
    icon: Clock,
  },
  contacted: {
    label: "Contacted",
    bg: "bg-amber-50 text-amber-700 border-amber-200",
    dot: "bg-amber-500",
    icon: MessageSquare,
  },
  converted: {
    label: "Converted",
    bg: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
    icon: CheckCircle2,
  },
  lost: {
    label: "Lost",
    bg: "bg-rose-50 text-rose-700 border-rose-200",
    dot: "bg-rose-500",
    icon: XCircle,
  },
};

const CHART_COLORS = [
  "#20373B",
  "#519CAB",
  "#FFC64F",
  "#10B981",
  "#F59E0B",
  "#EC4899",
  "#8B5CF6",
  "#3B82F6",
  "#64748B",
];

export default function EnquiriesPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("list"); // 'list' | 'analytics' | 'reports'

  // Filter States
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateRange, setDateRange] = useState({
    from: "",
    to: "",
  });

  // Data States
  const [enquiries, setEnquiries] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);

  // Cars for dropdown
  const [carsList, setCarsList] = useState([]);

  // Analytics & Summary States
  const [summary, setSummary] = useState({
    total: 0,
    converted: 0,
    conversionRate: 0,
    topCar: null,
    topCity: null,
    byStatus: { new: 0, contacted: 0, converted: 0, lost: 0 },
  });
  const [locationData, setLocationData] = useState([]);
  const [carData, setCarData] = useState([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  // Modals
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingEnquiry, setEditingEnquiry] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [exportLoading, setExportLoading] = useState(false);

  // Form State for Add / Edit
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    city: "",
    state: "",
    car_id: "",
    car_model: "",
    enquiry_date: new Date().toISOString().slice(0, 10),
    notes: "",
    status: "new",
  });
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  // Load Fleet Cars for dropdown
  useEffect(() => {
    async function loadCars() {
      try {
        const res = await api.get("/cars");
        const cars = res.data || [];
        setCarsList(cars);
      } catch (err) {
        console.error("Failed to load cars list:", err);
      }
    }
    loadCars();
  }, []);

  // Fetch Enquiries List
  const fetchEnquiries = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page,
        limit: 20,
        search: debouncedSearch || undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
        from: dateRange.from || undefined,
        to: dateRange.to || undefined,
      };

      const res = await api.get("/enquiries", { params });
      setEnquiries(res.data.enquiries || []);
      setTotal(res.data.total || 0);
      setPages(res.data.pages || 1);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail || "Failed to load enquiries"));
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, statusFilter, dateRange]);

  // Fetch Analytics
  const fetchAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    try {
      const params = {
        from: dateRange.from || undefined,
        to: dateRange.to || undefined,
      };

      const [sumRes, locRes, carRes] = await Promise.all([
        api.get("/enquiries/analytics/summary", { params }),
        api.get("/enquiries/analytics/by-location", { params }),
        api.get("/enquiries/analytics/by-car", { params }),
      ]);

      setSummary(sumRes.data || {});
      setLocationData(locRes.data || []);
      setCarData(carRes.data || []);
    } catch (err) {
      console.error("Failed to load analytics:", err);
    } finally {
      setAnalyticsLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    fetchEnquiries();
  }, [fetchEnquiries]);

  useEffect(() => {
    if (activeTab === "analytics" || activeTab === "reports") {
      fetchAnalytics();
    }
  }, [activeTab, fetchAnalytics]);

  // Quick Inline Status Update
  const handleQuickStatusChange = async (enquiryId, newStatus) => {
    try {
      await api.put(`/enquiries/${enquiryId}`, { status: newStatus });
      toast.success(`Enquiry marked as ${newStatus}`);
      fetchEnquiries();
      if (activeTab !== "list") fetchAnalytics();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail || "Status update failed"));
    }
  };

  // Form Validation
  const validateForm = () => {
    const errors = {};
    if (!form.name.trim()) errors.name = "Customer name is required";
    const cleanPhone = form.phone.replace(/\D/g, "");
    if (!cleanPhone) {
      errors.phone = "Phone number is required";
    } else if (cleanPhone.length !== 10) {
      errors.phone = "Must be a valid 10-digit mobile number";
    }
    if (!form.city.trim()) errors.city = "City is required";
    if (!form.state.trim()) errors.state = "State is required";
    if (!form.car_model.trim() && !form.car_id) errors.car_model = "Please select or type a car model";

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Submit Add / Edit
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        phone: form.phone.replace(/\D/g, ""),
        email: form.email.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        car_id: form.car_id || undefined,
        car_model: form.car_model.trim(),
        enquiry_date: form.enquiry_date || new Date().toISOString(),
        notes: form.notes.trim(),
        status: form.status,
      };

      if (editingEnquiry) {
        await api.put(`/enquiries/${editingEnquiry.id}`, payload);
        toast.success("Enquiry updated successfully");
      } else {
        await api.post("/enquiries", payload);
        toast.success("New enquiry logged successfully");
      }

      setIsAddOpen(false);
      setEditingEnquiry(null);
      resetForm();
      fetchEnquiries();
      fetchAnalytics();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail || "Failed to save enquiry"));
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setForm({
      name: "",
      phone: "",
      email: "",
      city: "",
      state: "",
      car_id: "",
      car_model: "",
      enquiry_date: new Date().toISOString().slice(0, 10),
      notes: "",
      status: "new",
    });
    setFormErrors({});
  };

  const openEdit = (enq) => {
    setEditingEnquiry(enq);
    setForm({
      name: enq.name || "",
      phone: enq.phone || "",
      email: enq.email || "",
      city: enq.city || "",
      state: enq.state || "",
      car_id: enq.car_id || "",
      car_model: enq.car_model || "",
      enquiry_date: (enq.enquiry_date || "").slice(0, 10),
      notes: enq.notes || "",
      status: enq.status || "new",
    });
    setIsAddOpen(true);
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/enquiries/${id}`);
      toast.success("Enquiry deleted");
      setDeletingId(null);
      fetchEnquiries();
      fetchAnalytics();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail || "Delete failed"));
    }
  };

  // Export handlers
  const handlePdfExport = async () => {
    setExportLoading(true);
    try {
      const dateLabel = dateRange.from && dateRange.to ? `${dateRange.from} to ${dateRange.to}` : "All Records";
      await exportPdf("enquiries-report-container", "Car Castle Goa", dateLabel);
      toast.success("PDF report downloaded");
    } catch (err) {
      toast.error(err.message || "Failed to export PDF");
    } finally {
      setExportLoading(false);
    }
  };

  const handleExcelExport = async () => {
    setExportLoading(true);
    try {
      await exportExcel(dateRange, "Car Castle Goa");
      toast.success("Excel sheet downloaded");
    } catch (err) {
      toast.error(err.message || "Failed to export Excel");
    } finally {
      setExportLoading(false);
    }
  };

  return (
    <AppLayout
      title="Enquiries & Leads"
      subtitle="Track customer enquiries, conversions, city trends, and export reports"
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              resetForm();
              setEditingEnquiry(null);
              setIsAddOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#20373B] hover:bg-[#2C494E] text-[#FFC64F] hover:text-white rounded-xl text-xs sm:text-sm font-bold shadow-sm transition-all active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Log Enquiry</span>
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Navigation Tabs */}
        <div className="flex items-center justify-between border-b border-[#C3E7F1]/80 pb-2 flex-wrap gap-3">
          <div className="flex items-center gap-1.5 bg-[#F4FAFC] p-1 rounded-xl border border-[#C3E7F1]">
            <button
              onClick={() => setActiveTab("list")}
              className={`px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-all ${
                activeTab === "list"
                  ? "bg-[#20373B] text-white shadow-xs"
                  : "text-slate-600 hover:text-[#20373B] hover:bg-white/80"
              }`}
            >
              All Enquiries ({total})
            </button>
            <button
              onClick={() => setActiveTab("analytics")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-all ${
                activeTab === "analytics"
                  ? "bg-[#20373B] text-white shadow-xs"
                  : "text-slate-600 hover:text-[#20373B] hover:bg-white/80"
              }`}
            >
              <PieIcon className="w-3.5 h-3.5 text-[#FFC64F]" />
              <span>Analytics & Trends</span>
            </button>
            <button
              onClick={() => setActiveTab("reports")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-all ${
                activeTab === "reports"
                  ? "bg-[#20373B] text-white shadow-xs"
                  : "text-slate-600 hover:text-[#20373B] hover:bg-white/80"
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-[#519CAB]" />
              <span>Reports & Export</span>
            </button>
          </div>

          {/* Quick Date Range Filter for Header */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-white border border-[#C3E7F1] rounded-xl px-2.5 py-1.5 text-xs text-slate-600 shadow-2xs">
              <Calendar className="w-3.5 h-3.5 text-[#519CAB]" />
              <input
                type="date"
                value={dateRange.from}
                onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
                className="outline-none text-xs bg-transparent text-[#20373B] font-medium"
                title="From Date"
              />
              <span className="text-slate-400">to</span>
              <input
                type="date"
                value={dateRange.to}
                onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
                className="outline-none text-xs bg-transparent text-[#20373B] font-medium"
                title="To Date"
              />
              {(dateRange.from || dateRange.to) && (
                <button
                  onClick={() => setDateRange({ from: "", to: "" })}
                  className="p-0.5 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600"
                  title="Clear Date Filter"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <button
              onClick={() => {
                fetchEnquiries();
                if (activeTab !== "list") fetchAnalytics();
              }}
              className="p-2 rounded-xl bg-white border border-[#C3E7F1] text-slate-600 hover:text-[#20373B] hover:bg-slate-50 transition-all shadow-2xs"
              title="Refresh Data"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* TAB 1: ENQUIRIES LIST VIEW */}
        {activeTab === "list" && (
          <div className="space-y-4">
            {/* Filter Bar & Search */}
            <div className="bg-white p-3 sm:p-4 rounded-2xl border border-[#C3E7F1]/80 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
              {/* Search Bar */}
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search name, phone, city, car..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-[#F4FAFC] border border-[#C3E7F1] focus:border-[#519CAB] rounded-xl text-xs sm:text-sm font-medium outline-none text-[#20373B] transition-all"
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Status Filter Pills */}
              <div className="flex items-center gap-1.5 flex-wrap w-full sm:w-auto">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mr-1 hidden sm:inline">
                  Status:
                </span>
                {["all", "new", "contacted", "converted", "lost"].map((st) => (
                  <button
                    key={st}
                    onClick={() => {
                      setStatusFilter(st);
                      setPage(1);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${
                      statusFilter === st
                        ? "bg-[#20373B] text-[#FFC64F] shadow-xs"
                        : "bg-[#F4FAFC] text-slate-600 hover:bg-[#C3E7F1]/40 border border-[#C3E7F1]"
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            {/* Enquiries Table Card */}
            <div className="bg-white rounded-2xl border border-[#C3E7F1]/80 shadow-xs overflow-hidden">
              {loading ? (
                <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-[#519CAB]" />
                  <p className="text-sm font-medium">Loading enquiries...</p>
                </div>
              ) : enquiries.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="w-12 h-12 rounded-full bg-[#F4FAFC] border border-[#C3E7F1] flex items-center justify-center mx-auto mb-3 text-slate-400">
                    <MessageSquare className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-bold text-[#20373B]">No enquiries found</h3>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
                    {search || statusFilter !== "all" || dateRange.from
                      ? "No records match your active search or filters."
                      : "Start logging customer enquiries to track bookings and lead conversions."}
                  </p>
                  <button
                    onClick={() => {
                      resetForm();
                      setIsAddOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#20373B] text-[#FFC64F] rounded-xl text-xs font-bold hover:bg-[#2C494E] transition-all cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Log First Enquiry</span>
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs sm:text-sm">
                    <thead>
                      <tr className="bg-[#F4FAFC] border-b border-[#C3E7F1]/80 text-[#20373B] font-extrabold uppercase text-[11px] tracking-wider">
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4">Customer Details</th>
                        <th className="py-3 px-4">Location</th>
                        <th className="py-3 px-4">Car of Interest</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">Notes</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {enquiries.map((enq) => {
                        const statusMeta = STATUS_CONFIG[enq.status] || STATUS_CONFIG.new;
                        const cleanPhone = (enq.phone || "").replace(/\D/g, "");

                        return (
                          <tr key={enq.id} className="hover:bg-[#F4FAFC]/60 transition-colors group">
                            {/* Date */}
                            <td className="py-3 px-4 whitespace-nowrap text-slate-600 font-medium">
                              {formatDate(enq.enquiry_date)}
                            </td>

                            {/* Customer */}
                            <td className="py-3 px-4">
                              <div className="font-bold text-[#20373B]">{enq.name}</div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <a
                                  href={`tel:${cleanPhone}`}
                                  className="text-xs text-[#519CAB] hover:text-[#20373B] font-medium flex items-center gap-1"
                                  title="Call Customer"
                                >
                                  <Phone className="w-3 h-3" />
                                  <span>{enq.phone}</span>
                                </a>
                                {cleanPhone && (
                                  <a
                                    href={`https://wa.me/91${cleanPhone}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                                    title="Open WhatsApp chat"
                                  >
                                    WhatsApp
                                  </a>
                                )}
                              </div>
                              {enq.email && (
                                <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                                  <Mail className="w-2.5 h-2.5" />
                                  <span>{enq.email}</span>
                                </div>
                              )}
                            </td>

                            {/* Location */}
                            <td className="py-3 px-4">
                              <div className="font-semibold text-slate-800 flex items-center gap-1">
                                <MapPin className="w-3 h-3 text-[#519CAB] shrink-0" />
                                <span>{enq.city}</span>
                              </div>
                              <div className="text-[11px] text-slate-400 pl-4">{enq.state}</div>
                            </td>

                            {/* Car Model */}
                            <td className="py-3 px-4">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-[#20373B] font-bold text-xs border border-slate-200">
                                <Car className="w-3 h-3 text-[#519CAB]" />
                                {enq.car_model || "Any Car"}
                              </span>
                            </td>

                            {/* Status */}
                            <td className="py-3 px-4 whitespace-nowrap">
                              <select
                                value={enq.status}
                                onChange={(e) => handleQuickStatusChange(enq.id, e.target.value)}
                                className={`text-xs font-bold px-2.5 py-1 rounded-lg border outline-none cursor-pointer ${statusMeta.bg}`}
                              >
                                <option value="new">New Lead</option>
                                <option value="contacted">Contacted</option>
                                <option value="converted">Converted</option>
                                <option value="lost">Lost</option>
                              </select>
                            </td>

                            {/* Notes */}
                            <td className="py-3 px-4 max-w-xs truncate text-slate-500 text-xs">
                              {enq.notes || <span className="text-slate-300 italic">No notes</span>}
                            </td>

                            {/* Actions */}
                            <td className="py-3 px-4 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => openEdit(enq)}
                                  className="p-1.5 rounded-lg text-slate-500 hover:text-[#20373B] hover:bg-[#C3E7F1]/30 transition-all"
                                  title="Edit Enquiry"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeletingId(enq.id)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all"
                                  title="Delete Enquiry"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination */}
              {pages > 1 && (
                <div className="px-4 py-3 bg-[#F4FAFC] border-t border-[#C3E7F1]/80 flex items-center justify-between">
                  <span className="text-xs text-slate-500 font-medium">
                    Showing Page <strong className="text-[#20373B]">{page}</strong> of <strong>{pages}</strong> ({total} enquiries)
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="p-1.5 rounded-lg border border-[#C3E7F1] bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      disabled={page >= pages}
                      onClick={() => setPage((p) => Math.min(pages, p + 1))}
                      className="p-1.5 rounded-lg border border-[#C3E7F1] bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: ANALYTICS & CHARTS VIEW */}
        {activeTab === "analytics" && (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
              <div className="bg-white p-4 rounded-2xl border border-[#C3E7F1]/80 shadow-xs">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Total Enquiries</span>
                <div className="text-2xl sm:text-3xl font-extrabold text-[#20373B] mt-1">{summary.total || 0}</div>
                <p className="text-[11px] text-[#519CAB] font-semibold mt-0.5">Recorded customer leads</p>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-[#C3E7F1]/80 shadow-xs">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Conversion Rate</span>
                <div className="text-2xl sm:text-3xl font-extrabold text-emerald-600 mt-1">
                  {summary.conversionRate || 0}%
                </div>
                <p className="text-[11px] text-slate-500 font-semibold mt-0.5">{summary.converted || 0} booked bookings</p>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-[#C3E7F1]/80 shadow-xs">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Top Origin City</span>
                <div className="text-xl sm:text-2xl font-extrabold text-[#20373B] truncate mt-1">
                  {summary.topCity?.city || "—"}
                </div>
                <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
                  {summary.topCity ? `${summary.topCity.count} enquiries` : "No data"}
                </p>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-[#C3E7F1]/80 shadow-xs">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Top Car Model</span>
                <div className="text-xl sm:text-2xl font-extrabold text-[#20373B] truncate mt-1">
                  {summary.topCar?.modelName || "—"}
                </div>
                <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
                  {summary.topCar ? `${summary.topCar.count} enquiries` : "No data"}
                </p>
              </div>
            </div>

            {/* Visual Charts */}
            {analyticsLoading ? (
              <div className="py-20 flex justify-center text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin text-[#519CAB]" />
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Enquiries by City */}
                <div className="bg-white p-5 rounded-2xl border border-[#C3E7F1]/80 shadow-xs">
                  <h3 className="font-bold text-[#20373B] text-base mb-4 flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-[#519CAB]" />
                    <span>Enquiries by Origin City</span>
                  </h3>
                  {locationData.length === 0 ? (
                    <div className="h-64 flex items-center justify-center text-slate-400 text-xs">No city data available</div>
                  ) : (
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={locationData}
                            dataKey="count"
                            nameKey="city"
                            cx="50%"
                            cy="50%"
                            outerRadius={95}
                            innerRadius={50}
                            paddingAngle={3}
                            label={({ city, percent }) => `${city} (${(percent * 100).toFixed(0)}%)`}
                          >
                            {locationData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <RechartsTooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                {/* Enquiries by Car Model */}
                <div className="bg-white p-5 rounded-2xl border border-[#C3E7F1]/80 shadow-xs">
                  <h3 className="font-bold text-[#20373B] text-base mb-4 flex items-center gap-2">
                    <Car className="w-4 h-4 text-[#FFC64F]" />
                    <span>Demand by Car Model</span>
                  </h3>
                  {carData.length === 0 ? (
                    <div className="h-64 flex items-center justify-center text-slate-400 text-xs">No car demand data available</div>
                  ) : (
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={carData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                          <XAxis dataKey="modelName" angle={-25} textAnchor="end" interval={0} tick={{ fontSize: 11 }} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                          <RechartsTooltip />
                          <Bar dataKey="count" fill="#519CAB" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: REPORTS & EXPORT VIEW */}
        {activeTab === "reports" && (
          <div className="space-y-5">
            {/* Header Actions */}
            <div className="bg-white p-4 rounded-2xl border border-[#C3E7F1]/80 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-[#20373B] text-base">Enquiries & Leads Executive Report</h3>
                <p className="text-xs text-slate-500">
                  Period: {dateRange.from || "Start"} to {dateRange.to || "End"}
                </p>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={handlePdfExport}
                  disabled={exportLoading}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 bg-white border border-[#C3E7F1] hover:bg-slate-50 text-[#20373B] rounded-xl text-xs font-bold shadow-2xs transition-all active:scale-95 disabled:opacity-50"
                >
                  <FileText className="w-3.5 h-3.5 text-rose-600" />
                  <span>{exportLoading ? "Generating..." : "Download PDF"}</span>
                </button>
                <button
                  onClick={handleExcelExport}
                  disabled={exportLoading}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 bg-[#20373B] hover:bg-[#2C494E] text-[#FFC64F] rounded-xl text-xs font-bold shadow-xs transition-all active:scale-95 disabled:opacity-50"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>{exportLoading ? "Generating..." : "Download Excel"}</span>
                </button>
              </div>
            </div>

            {/* Printable & Exportable Container */}
            <div id="enquiries-report-container" className="bg-white p-5 rounded-2xl border border-[#C3E7F1]/80 shadow-xs space-y-6">
              {/* Report Summary Cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl bg-[#F4FAFC] border border-[#C3E7F1]">
                  <div className="text-[11px] font-bold uppercase text-slate-400">Total Enquiries</div>
                  <div className="text-2xl font-extrabold text-[#20373B]">{summary.total || 0}</div>
                </div>
                <div className="p-3.5 rounded-xl bg-[#F4FAFC] border border-[#C3E7F1]">
                  <div className="text-[11px] font-bold uppercase text-slate-400">Converted Bookings</div>
                  <div className="text-2xl font-extrabold text-emerald-600">{summary.converted || 0}</div>
                </div>
                <div className="p-3.5 rounded-xl bg-[#F4FAFC] border border-[#C3E7F1]">
                  <div className="text-[11px] font-bold uppercase text-slate-400">Conversion Ratio</div>
                  <div className="text-2xl font-extrabold text-[#519CAB]">{summary.conversionRate || 0}%</div>
                </div>
              </div>

              {/* Tabular Enquiries Preview in Report */}
              <div className="border border-[#C3E7F1] rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-[#F4FAFC] border-b border-[#C3E7F1] font-bold text-[#20373B] text-xs uppercase tracking-wider">
                  Customer & Lead Registry
                </div>
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Customer</th>
                      <th className="py-2.5 px-3">Contact</th>
                      <th className="py-2.5 px-3">City & State</th>
                      <th className="py-2.5 px-3">Interested Model</th>
                      <th className="py-2.5 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {enquiries.slice(0, 15).map((enq) => (
                      <tr key={enq.id}>
                        <td className="py-2 px-3 text-slate-500">{formatDate(enq.enquiry_date)}</td>
                        <td className="py-2 px-3 font-semibold text-[#20373B]">{enq.name}</td>
                        <td className="py-2 px-3 text-slate-600">{enq.phone}</td>
                        <td className="py-2 px-3 text-slate-600">
                          {enq.city}, {enq.state}
                        </td>
                        <td className="py-2 px-3 font-medium text-slate-800">{enq.car_model || "—"}</td>
                        <td className="py-2 px-3 capitalize font-bold text-[11px] text-slate-700">
                          <span className={`px-2 py-0.5 rounded ${STATUS_CONFIG[enq.status]?.bg || ""}`}>
                            {enq.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: LOG / EDIT ENQUIRY */}
        {isAddOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
            <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-[#C3E7F1] overflow-hidden flex flex-col max-h-[90vh]">
              {/* Modal Header */}
              <div className="px-5 py-4 bg-[#20373B] text-white flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-[#FFC64F]">
                    {editingEnquiry ? "Edit Customer Enquiry" : "Log New Customer Enquiry"}
                  </h3>
                  <p className="text-xs text-slate-300">
                    Capture contact details, requested vehicle, and lead status
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsAddOpen(false);
                    setEditingEnquiry(null);
                  }}
                  className="p-1 rounded-lg text-slate-300 hover:text-white hover:bg-[#2C494E] transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Form */}
              <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 flex-1">
                {/* Customer Name & Phone */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-bold text-[#20373B] mb-1">Customer Name *</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 bg-[#F4FAFC] border border-[#C3E7F1] focus:border-[#519CAB] rounded-xl text-sm font-medium outline-none"
                      placeholder="e.g. Rahul Sharma"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      required
                    />
                    {formErrors.name && <span className="text-[11px] text-rose-500 font-medium">{formErrors.name}</span>}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#20373B] mb-1">Phone Number (10 Digits) *</label>
                    <input
                      type="tel"
                      className="w-full px-3 py-2 bg-[#F4FAFC] border border-[#C3E7F1] focus:border-[#519CAB] rounded-xl text-sm font-medium outline-none"
                      placeholder="9876543210"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      required
                    />
                    {formErrors.phone && <span className="text-[11px] text-rose-500 font-medium">{formErrors.phone}</span>}
                  </div>
                </div>

                {/* Email */}
                <div>
                  <label className="block text-xs font-bold text-[#20373B] mb-1">Email Address (Optional)</label>
                  <input
                    type="email"
                    className="w-full px-3 py-2 bg-[#F4FAFC] border border-[#C3E7F1] focus:border-[#519CAB] rounded-xl text-sm font-medium outline-none"
                    placeholder="customer@example.com"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>

                {/* City & State (with CityDropdown) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-bold text-[#20373B] mb-1">City / Origin *</label>
                    <CityDropdown
                      value={form.city}
                      onChange={(city) => setForm((prev) => ({ ...prev, city }))}
                      onStateChange={(state) => setForm((prev) => ({ ...prev, state }))}
                      required
                    />
                    {formErrors.city && <span className="text-[11px] text-rose-500 font-medium">{formErrors.city}</span>}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#20373B] mb-1">State *</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2.5 bg-[#F4FAFC] border border-[#C3E7F1] focus:border-[#519CAB] rounded-xl text-sm font-medium outline-none"
                      placeholder="Auto-filled state"
                      value={form.state}
                      onChange={(e) => setForm({ ...form, state: e.target.value })}
                      required
                    />
                    {formErrors.state && <span className="text-[11px] text-rose-500 font-medium">{formErrors.state}</span>}
                  </div>
                </div>

                {/* Car of Interest & Status */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-bold text-[#20373B] mb-1">Car Model of Interest *</label>
                    <div className="space-y-1.5">
                      <select
                        className="w-full px-3 py-2 bg-[#F4FAFC] border border-[#C3E7F1] focus:border-[#519CAB] rounded-xl text-xs sm:text-sm font-medium outline-none"
                        value={form.car_id}
                        onChange={(e) => {
                          const selectedCar = carsList.find((c) => c.id === e.target.value);
                          setForm({
                            ...form,
                            car_id: e.target.value,
                            car_model: selectedCar ? selectedCar.model : form.car_model,
                          });
                        }}
                      >
                        <option value="">-- Select from Car Fleet --</option>
                        {carsList.map((car) => (
                          <option key={car.id} value={car.id}>
                            {car.model} ({car.registration_no})
                          </option>
                        ))}
                      </select>

                      <input
                        type="text"
                        className="w-full px-3 py-1.5 bg-[#F4FAFC] border border-[#C3E7F1] focus:border-[#519CAB] rounded-xl text-xs font-medium outline-none"
                        placeholder="Or custom model (e.g. Thar 4x4 / Creta)"
                        value={form.car_model}
                        onChange={(e) => setForm({ ...form, car_model: e.target.value })}
                      />
                    </div>
                    {formErrors.car_model && (
                      <span className="text-[11px] text-rose-500 font-medium">{formErrors.car_model}</span>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#20373B] mb-1">Lead Status</label>
                    <select
                      className="w-full px-3 py-2 bg-[#F4FAFC] border border-[#C3E7F1] focus:border-[#519CAB] rounded-xl text-sm font-medium outline-none"
                      value={form.status}
                      onChange={(e) => setForm({ ...form, status: e.target.value })}
                    >
                      <option value="new">New Lead</option>
                      <option value="contacted">Contacted</option>
                      <option value="converted">Converted</option>
                      <option value="lost">Lost</option>
                    </select>

                    <label className="block text-xs font-bold text-[#20373B] mt-2 mb-1">Enquiry Date</label>
                    <input
                      type="date"
                      className="w-full px-3 py-1.5 bg-[#F4FAFC] border border-[#C3E7F1] focus:border-[#519CAB] rounded-xl text-xs font-medium outline-none"
                      value={form.enquiry_date}
                      onChange={(e) => setForm({ ...form, enquiry_date: e.target.value })}
                    />
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-bold text-[#20373B] mb-1">Customer Requirements & Notes</label>
                  <textarea
                    rows={2}
                    className="w-full px-3 py-2 bg-[#F4FAFC] border border-[#C3E7F1] focus:border-[#519CAB] rounded-xl text-xs sm:text-sm font-medium outline-none resize-none"
                    placeholder="Rental duration, dates, pickup location, rate quoted..."
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  />
                </div>

                {/* Submit Buttons */}
                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddOpen(false);
                      setEditingEnquiry(null);
                    }}
                    className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2 rounded-xl bg-[#20373B] hover:bg-[#2C494E] text-[#FFC64F] text-xs font-bold shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>{editingEnquiry ? "Save Changes" : "Create Enquiry"}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL: DELETE CONFIRMATION */}
        {deletingId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
            <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl border border-rose-200 p-5 space-y-4 text-center">
              <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-base font-bold text-[#20373B]">Delete Enquiry?</h4>
                <p className="text-xs text-slate-500 mt-1">
                  Are you sure you want to delete this enquiry record? This action cannot be undone.
                </p>
              </div>
              <div className="flex items-center justify-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDeletingId(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(deletingId)}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-sm"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

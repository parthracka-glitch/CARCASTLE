import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { Toaster } from "sonner";
import { Loader2 } from "lucide-react";

import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import EnquiriesPage from "@/pages/EnquiriesPage";
import BookingsPage from "@/pages/BookingsPage";
import TransfersPage from "@/pages/TransfersPage";
import EntitiesPage from "@/pages/EntitiesPage";
import EntityLedgerPage from "@/pages/EntityLedgerPage";
import CarsPage from "@/pages/CarsPage";
import LedgerPage from "@/pages/LedgerPage";
import FinancePage from "@/pages/FinancePage";
import ReportsPage from "@/pages/ReportsPage";
import SettingsPage from "@/pages/SettingsPage";
import ErrorBoundary from "@/components/ErrorBoundary";

function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F4FAFC]">
      <Loader2 className="w-6 h-6 animate-spin text-[#519CAB]" />
    </div>
  );
}

function Protected({ children, superOnly }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user || typeof user !== "object") return <Navigate to="/login" replace />;
  if (superOnly && user.role !== "super_admin") return <Navigate to="/" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<Protected><DashboardPage /></Protected>} />
      <Route path="/enquiries" element={<Protected><EnquiriesPage /></Protected>} />
      <Route path="/bookings" element={<Protected><BookingsPage /></Protected>} />
      <Route path="/transfers" element={<Protected><TransfersPage /></Protected>} />
      <Route path="/owners" element={<Protected><EntitiesPage type="owner" /></Protected>} />
      <Route path="/owners/:id" element={<Protected><EntityLedgerPage type="owner" /></Protected>} />
      <Route path="/agents" element={<Protected superOnly><EntitiesPage type="agent" /></Protected>} />
      <Route path="/agents/:id" element={<Protected superOnly><EntityLedgerPage type="agent" /></Protected>} />
      <Route path="/cars" element={<Protected superOnly><CarsPage /></Protected>} />
      <Route path="/ledger" element={<Protected superOnly><LedgerPage /></Protected>} />
      <Route path="/finance" element={<Protected superOnly><FinancePage /></Protected>} />
      <Route path="/reports" element={<Protected superOnly><ReportsPage /></Protected>} />
      <Route path="/settings" element={<Protected superOnly><SettingsPage /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <div className="App">
        <AuthProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
          <Toaster position="top-right" richColors closeButton />
        </AuthProvider>
      </div>
    </ErrorBoundary>
  );
}

export default App;

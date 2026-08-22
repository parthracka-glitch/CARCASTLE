import React, { useState } from "react";

import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { formatApiError } from "@/lib/api";
import { Car, Loader2, Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  const { user, login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const navigate = useNavigate();

  if (user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await login(email.trim().toLowerCase(), password);
      toast.success("Welcome back");
      navigate("/");
    } catch (e) {
      const msg = formatApiError(e.response?.data?.detail) || e.message;
      setErr(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left panel */}
      <div className="relative hidden lg:block">
        <img
          src="https://images.pexels.com/photos/28688386/pexels-photo-28688386.jpeg"
          alt="Goa street at sunset"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-[#20373B]/90 backdrop-blur-xs" />
        <div className="relative z-10 h-full flex flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-3">
            <img
              src="/logo.jpeg"
              alt="Car Castle Goa Logo"
              className="w-12 h-12 rounded-xl object-cover shadow-lg border border-[#FFC64F]/40 shrink-0 bg-white"
            />
            <div>
              <div className="font-display font-bold text-xl tracking-wide">Car Castle</div>
              <div className="text-[10px] uppercase tracking-widest text-[#FFC64F] font-bold">Goa</div>
            </div>
          </div>
          <div>
            <div className="text-[#FFC64F] uppercase text-[11px] tracking-widest font-bold mb-3">
              Ops Console · Internal
            </div>
            <h2 className="font-display text-4xl font-extrabold leading-tight mb-4 text-white">
              Every rupee, every ride, every margin — accounted for.
            </h2>
            <p className="text-[#C3E7F1] text-[15px] leading-relaxed max-w-lg">
              Track owner payables, airport transfer agents, and running profit margins in one
              purpose-built dashboard.
            </p>
          </div>
          <div className="text-xs text-[#C3E7F1]/80 font-medium">
            © {new Date().getFullYear()} Car Castle Goa · Self-drive rental brokerage
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex items-center justify-center p-8 bg-[#F4FAFC]">
        <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-lg border border-[#C3E7F1]">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-10 h-10 rounded-md bg-[#FFC64F] flex items-center justify-center shadow-md">
              <Car className="w-5 h-5 text-[#20373B]" strokeWidth={2.25} />
            </div>
            <div>
              <div className="font-display font-bold text-[#20373B]">Car Castle</div>
              <div className="text-[10px] uppercase tracking-widest text-[#519CAB]">Goa</div>
            </div>
          </div>

          <div className="mb-8">
            <div className="text-[#519CAB] uppercase text-[11px] tracking-widest font-bold mb-2">
              Sign in
            </div>
            <h1 className="font-display text-3xl font-extrabold text-[#20373B] tracking-tight">
              Welcome back
            </h1>
            <p className="text-sm text-slate-500 mt-2">
              Use your Car Castle Goa credentials to continue.
            </p>
          </div>

          <form onSubmit={submit} className="space-y-4" data-testid="login-form">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-[#20373B] font-medium">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@carcastlegoa.com"
                className="border-[#C3E7F1] focus:border-[#519CAB] focus:ring-[#519CAB]"
                data-testid="login-email-input"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-[#20373B] font-medium">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="border-[#C3E7F1] focus:border-[#519CAB] focus:ring-[#519CAB] pr-10"
                  data-testid="login-password-input"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-hidden"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {err && (
              <div
                className="text-sm bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-md font-medium"
                data-testid="login-error"
              >
                {err}
              </div>
            )}

            <Button
              type="submit"
              disabled={busy}
              className="w-full bg-[#20373B] hover:bg-[#2C494E] text-[#FFC64F] h-11 text-[15px] font-bold shadow-md transition-all"
              data-testid="login-submit-button"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin text-[#FFC64F]" /> : "Sign in"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

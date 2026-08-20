"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { getSupabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogIn, Loader2, Eye, EyeOff, ShieldCheck, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const router = useRouter();
  const { setUser } = useAuth();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    if (!trimmedEmail || !trimmedPassword) {
      const msg = "Please enter both email and password";
      setErrorMessage(msg);
      toast.error(msg);
      return;
    }

    setLoading(true);

    try {
      console.log("[Auth] Initiating login process for:", trimmedEmail);

      // Timeout promise for strict 5-second max duration
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Login operation timed out (5s limit reached).")), 5000)
      );

      // 1. Direct Supabase signInWithPassword attempt with logs & 5s timeout
      try {
        const supabase = getSupabase();
        console.log("[Auth] Calling supabase.auth.signInWithPassword with 5s timeout...");

        const authAttempt = supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password: trimmedPassword,
        });

        const sbResult = await Promise.race([authAttempt, timeoutPromise]);
        console.log("[Auth] supabase.auth.signInWithPassword response:", sbResult);
      } catch (sbErr: any) {
        console.warn("[Auth] Supabase client authentication notice:", sbErr?.message || sbErr);
      }

      // 2. Server session creation via /api/auth/login with 5s timeout
      console.log("[Auth] Calling /api/auth/login to generate session token...");
      const apiLoginPromise = fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail, password: trimmedPassword }),
      });

      const res = await Promise.race([apiLoginPromise, timeoutPromise]);
      console.log("[Auth] /api/auth/login status:", res.status);

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const errText = data.error || "Invalid email or password";
        console.error("[Auth] Login failed:", errText);
        setErrorMessage(errText);
        toast.error(errText);
        setLoading(false);
        return;
      }

      if (data.user) {
        setUser(data.user);
      }

      console.log("[Auth] Login succeeded for user:", data.user);
      toast.success("Welcome back, Zain!");
      router.push("/");
      router.refresh();
    } catch (err: any) {
      const errText = err?.message || "Network error. Please try again.";
      console.error("[Auth] Unexpected login error:", err);
      setErrorMessage(errText);
      toast.error(errText);
      setLoading(false);
    }
  };

  return (
    <div id="login-container" className="min-h-screen flex items-center justify-center bg-slate-900 px-4 py-8 relative overflow-hidden">
      {/* Subtle background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl" />
      </div>

      <Card id="login-card" className="w-full max-w-md relative z-10 border-slate-800 bg-slate-900/90 text-white shadow-2xl backdrop-blur-xl">
        <CardHeader className="text-center space-y-3 pb-2 pt-6">
          <div className="mx-auto w-14 h-14 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <span className="text-2xl" role="img" aria-label="cattle">🐄</span>
          </div>
          <div>
            <CardTitle className="text-2xl font-bold tracking-tight text-white">
              Danish Cattle Feed
            </CardTitle>
            <CardDescription className="text-slate-400 mt-1 text-sm">
              Daily Register &amp; Accounts Management
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="pt-4 pb-6">
          <form id="login-form" onSubmit={handleLogin} className="space-y-4">
            {errorMessage && (
              <div
                id="login-error-alert"
                className="p-3 rounded-lg bg-red-500/15 border border-red-500/30 flex items-start gap-2.5 text-red-300 text-sm animate-in fade-in"
              >
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span className="leading-snug">{errorMessage}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="login-email" className="text-sm font-medium text-slate-300">
                Email Address
              </Label>
              <Input
                id="login-email"
                type="email"
                placeholder="zain@gmail.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                className="h-11 bg-slate-800/80 border-slate-700 text-white placeholder:text-slate-500 focus:border-emerald-500 focus:ring-emerald-500/20"
                autoComplete="email"
                disabled={loading}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="login-password" className="text-sm font-medium text-slate-300">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  className="h-11 bg-slate-800/80 border-slate-700 text-white placeholder:text-slate-500 focus:border-emerald-500 focus:ring-emerald-500/20 pr-12"
                  autoComplete="current-password"
                  disabled={loading}
                  required
                />
                <button
                  type="button"
                  id="toggle-password-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors p-1"
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              id="login-submit-btn"
              disabled={loading}
              className="w-full h-11 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-lg shadow-emerald-600/25 transition-all mt-2 cursor-pointer"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Signing In...</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <LogIn className="w-4 h-4" />
                  <span>Sign In</span>
                </div>
              )}
            </Button>
          </form>

          <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-center gap-2 text-xs text-slate-500">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>Secure System Access</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

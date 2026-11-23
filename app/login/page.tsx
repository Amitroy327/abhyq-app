"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"email" | "otp">("email");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSendOtp(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    setOtp("");

    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const text = await res.text();
      const data = text ? JSON.parse(text) : {};

      if (!res.ok) {
        setError(data.error || "Failed to send OTP.");
      } else {
        setStep("otp");
        setMessage("A 4-digit OTP has been sent to your email.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send OTP.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          otp: otp.trim(),
        }),
      });
      const text = await res.text();
      const data = text ? JSON.parse(text) : {};

      if (!res.ok) {
        setError(data.error || "Invalid or expired OTP.");
        return;
      }

      const supabase = getSupabaseBrowserClient();
      const { error: sessionError } = data.hashedToken
        ? await supabase.auth.verifyOtp({
            token_hash: data.hashedToken,
            type: "magiclink",
          })
        : await supabase.auth.verifyOtp({
            email: data.email,
            token: data.emailOtp,
            type: "email",
          });

      if (sessionError) {
        setError(sessionError.message);
      } else {
        router.push("/");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to verify OTP.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-white flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-6 space-y-5">
        <div>
          <h1 className="text-2xl font-semibold">ABHYQ AI Login</h1>
          <p className="text-sm text-neutral-400 mt-1">
            Enter your email and log in with a 4-digit OTP.
          </p>
        </div>

        {step === "email" ? (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm outline-none focus:border-white"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-white text-black font-medium py-3 text-sm disabled:opacity-50"
            >
              {loading ? "Sending OTP..." : "Send OTP"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <p className="text-xs text-neutral-400">
              Sent to: <span className="text-white">{email}</span>
            </p>
            <input
              type="text"
              inputMode="numeric"
              maxLength={4}
              required
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              placeholder="Enter 4-digit OTP"
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm tracking-widest outline-none focus:border-white"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-white text-black font-medium py-3 text-sm disabled:opacity-50"
            >
              {loading ? "Verifying..." : "Verify & Login"}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setOtp("");
                setError(null);
                setMessage(null);
              }}
              className="w-full text-xs text-neutral-400 hover:text-white py-1"
            >
              Change email
            </button>
          </form>
        )}

        {message && <p className="text-xs text-emerald-400">{message}</p>}
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    </main>
  );
}
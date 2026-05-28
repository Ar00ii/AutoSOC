"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setDone(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm border border-ink p-6 space-y-4" aria-label="Forgot password">
        <div>
          <div className="text-lg font-bold tracking-wider uppercase">AutoSoc</div>
          <div className="label-cap-muted mt-1">Reset password</div>
        </div>
        {!done && (
          <>
            <label className="block">
              <span className="label-cap">Email</span>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="block w-full mt-1 border border-ink bg-paper px-3 py-2 min-h-[40px]"
              />
            </label>
            <button type="submit" disabled={busy} className="w-full border border-ink px-3 py-2 min-h-[40px] text-xs uppercase tracking-wider hover:bg-ink hover:text-paper disabled:opacity-50">
              {busy ? "Sending..." : "Send reset link"}
            </button>
          </>
        )}
        {done && (
          <div role="alert" className="border border-ink p-3 text-sm">
            If <span className="tabular-nums">{email}</span> exists, a reset link has been sent (valid 30min). Without SMTP configured the link is logged to the backend console.
          </div>
        )}
        <Link href="/login" className="block text-center label-cap underline">Back to sign in</Link>
      </form>
    </div>
  );
}

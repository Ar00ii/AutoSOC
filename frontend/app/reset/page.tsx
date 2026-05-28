"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function ResetPage() {
  const [token, setToken] = useState("");
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    const t = p.get("token") || "";
    setToken(t);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (pwd !== pwd2) { setMsg({ kind: "err", text: "Passwords do not match" }); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, new_password: pwd }),
      });
      if (!r.ok) {
        const body = await r.json();
        throw new Error(body.detail || "Failed");
      }
      setMsg({ kind: "ok", text: "Password updated. You can sign in now." });
      setTimeout(() => { window.location.href = "/login"; }, 1500);
    } catch (err) {
      setMsg({ kind: "err", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm border border-ink p-6 space-y-4" aria-label="Reset password">
        <div>
          <div className="text-lg font-bold tracking-wider uppercase">AutoSoc</div>
          <div className="label-cap-muted mt-1">Set a new password</div>
        </div>
        <label className="block">
          <span className="label-cap">New password (min 12, 3 of lower/upper/digit/symbol)</span>
          <input type="password" required value={pwd} onChange={(e) => setPwd(e.target.value)} className="block w-full mt-1 border border-ink bg-paper px-3 py-2 min-h-[40px]" />
        </label>
        <label className="block">
          <span className="label-cap">Confirm new password</span>
          <input type="password" required value={pwd2} onChange={(e) => setPwd2(e.target.value)} className="block w-full mt-1 border border-ink bg-paper px-3 py-2 min-h-[40px]" />
        </label>
        <button type="submit" disabled={busy || !token} className="w-full border border-ink px-3 py-2 min-h-[40px] text-xs uppercase tracking-wider hover:bg-ink hover:text-paper disabled:opacity-50">
          {busy ? "Updating..." : "Update password"}
        </button>
        {msg && <div role="alert" className="border border-ink p-2 text-xs uppercase tracking-wider">{msg.text}</div>}
        <Link href="/login" className="block text-center label-cap underline">Back to sign in</Link>
      </form>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import useSWR, { mutate } from "swr";
import Topbar from "@/components/Topbar";
import { fetcher, getUser, postJSON } from "@/lib/auth";

interface MfaSetup { secret: string; otpauth_uri: string; qr_data_url: string }

export default function AccountPage() {
  const { data: mfaStatus } = useSWR<{ enabled: boolean }>("/api/auth/mfa/status", fetcher);
  const me = getUser();

  const [curr, setCurr] = useState("");
  const [next1, setNext1] = useState("");
  const [next2, setNext2] = useState("");
  const [pwdMsg, setPwdMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [setup, setSetup] = useState<MfaSetup | null>(null);
  const [otp, setOtp] = useState("");
  const [mfaMsg, setMfaMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [disablePwd, setDisablePwd] = useState("");

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwdMsg(null);
    if (next1 !== next2) {
      setPwdMsg({ kind: "err", text: "New passwords do not match" });
      return;
    }
    try {
      await postJSON("/api/auth/me/password", { current_password: curr, new_password: next1 });
      setPwdMsg({ kind: "ok", text: "Password changed. You will be asked to log in again." });
      setCurr(""); setNext1(""); setNext2("");
      setTimeout(() => { window.location.href = "/login"; }, 1500);
    } catch (err) {
      setPwdMsg({ kind: "err", text: (err as Error).message || "Failed" });
    }
  }

  async function startSetup() {
    setMfaMsg(null);
    try {
      const r = await postJSON<MfaSetup>("/api/auth/mfa/setup");
      setSetup(r);
    } catch (err) {
      setMfaMsg({ kind: "err", text: (err as Error).message || "Failed" });
    }
  }

  async function confirmSetup() {
    setMfaMsg(null);
    try {
      await postJSON("/api/auth/mfa/confirm", { code: otp });
      setSetup(null); setOtp("");
      setMfaMsg({ kind: "ok", text: "MFA enabled. You will need a code on next login." });
      mutate("/api/auth/mfa/status");
    } catch (err) {
      setMfaMsg({ kind: "err", text: (err as Error).message || "Code rejected" });
    }
  }

  async function disableMfa() {
    setMfaMsg(null);
    try {
      await postJSON("/api/auth/mfa/disable", { password: disablePwd });
      setDisablePwd("");
      setMfaMsg({ kind: "ok", text: "MFA disabled." });
      mutate("/api/auth/mfa/status");
    } catch (err) {
      setMfaMsg({ kind: "err", text: (err as Error).message || "Failed" });
    }
  }

  return (
    <div>
      <Topbar title="Account" />
      <div className="p-6 max-w-2xl space-y-6">
        <section className="border border-ink p-4">
          <div className="label-cap mb-2">Profile</div>
          <ul className="text-sm space-y-1 tabular-nums">
            <li>Email: <span className="font-semibold">{me?.email ?? "-"}</span></li>
            <li>Role: <span className="uppercase">{me?.role ?? "-"}</span></li>
            <li>MFA: <span className="uppercase">{mfaStatus?.enabled ? "enabled" : "disabled"}</span></li>
          </ul>
        </section>

        <section className="border border-ink p-4 space-y-3">
          <div className="label-cap">Change password</div>
          <form onSubmit={changePassword} className="space-y-3">
            <Field label="Current password">
              <input type="password" required value={curr} onChange={(e) => setCurr(e.target.value)} className="w-full border border-ink bg-paper px-3 py-2 min-h-[36px]" />
            </Field>
            <Field label="New password (min 12, 3 of lower/upper/digit/symbol)">
              <input type="password" required value={next1} onChange={(e) => setNext1(e.target.value)} className="w-full border border-ink bg-paper px-3 py-2 min-h-[36px]" />
            </Field>
            <Field label="Confirm new password">
              <input type="password" required value={next2} onChange={(e) => setNext2(e.target.value)} className="w-full border border-ink bg-paper px-3 py-2 min-h-[36px]" />
            </Field>
            <button type="submit" className="border border-ink px-3 py-2 min-h-[36px] text-xs uppercase tracking-wider hover:bg-ink hover:text-paper">
              Change password
            </button>
          </form>
          {pwdMsg && (
            <div role="alert" className="border border-ink p-2 text-xs uppercase tracking-wider">{pwdMsg.text}</div>
          )}
        </section>

        <section className="border border-ink p-4 space-y-3">
          <div className="label-cap">Two-factor authentication (TOTP)</div>

          {!mfaStatus?.enabled && !setup && (
            <button type="button" onClick={startSetup} className="border border-ink px-3 py-2 min-h-[36px] text-xs uppercase tracking-wider hover:bg-ink hover:text-paper">
              Enable MFA
            </button>
          )}

          {!mfaStatus?.enabled && setup && (
            <div className="space-y-3">
              <p className="text-sm text-muted">Scan with Google Authenticator, 1Password, Authy, etc. Then enter the 6-digit code below.</p>
              <img src={setup.qr_data_url} alt="MFA QR code" className="border border-ink bg-paper" width={220} height={220} />
              <details className="border border-hair p-2">
                <summary className="label-cap-muted cursor-pointer">Manual entry</summary>
                <pre className="mt-2 text-xs bg-row p-2 tabular-nums break-all whitespace-pre-wrap">{setup.secret}</pre>
              </details>
              <Field label="Code from app">
                <input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 8))} inputMode="numeric" className="w-full border border-ink bg-paper px-3 py-2 min-h-[36px] tracking-widest text-center text-lg tabular-nums" />
              </Field>
              <div className="flex gap-2">
                <button type="button" onClick={() => { setSetup(null); setOtp(""); }} className="border border-ink px-3 py-2 min-h-[36px] text-xs uppercase tracking-wider hover:bg-ink hover:text-paper">Cancel</button>
                <button type="button" onClick={confirmSetup} disabled={otp.length < 6} className="border border-ink px-3 py-2 min-h-[36px] text-xs uppercase tracking-wider hover:bg-ink hover:text-paper disabled:opacity-50">Confirm</button>
              </div>
            </div>
          )}

          {mfaStatus?.enabled && (
            <div className="space-y-3">
              <p className="text-sm text-muted">MFA is enabled. Disable it by re-entering your password.</p>
              <Field label="Password">
                <input type="password" value={disablePwd} onChange={(e) => setDisablePwd(e.target.value)} className="w-full border border-ink bg-paper px-3 py-2 min-h-[36px]" />
              </Field>
              <button type="button" onClick={disableMfa} className="border border-ink px-3 py-2 min-h-[36px] text-xs uppercase tracking-wider hover:bg-ink hover:text-paper">
                Disable MFA
              </button>
            </div>
          )}

          {mfaMsg && (
            <div role="alert" className="border border-ink p-2 text-xs uppercase tracking-wider">{mfaMsg.text}</div>
          )}
        </section>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="label-cap">{label}</span>
      {children}
    </label>
  );
}

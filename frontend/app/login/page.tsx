"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import { login, loginMfa, setSession, type SessionUser } from "@/lib/auth";

interface OidcStatus { enabled: boolean; issuer?: string }

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const { data: oidc } = useSWR<OidcStatus>("/api/auth/oidc/status", (u: string) => fetch(u).then((r) => r.json()));

  useEffect(() => {
    if (typeof window === "undefined") return;
    const h = window.location.hash;
    if (h.startsWith("#sso&")) {
      const p = new URLSearchParams(h.slice(5));
      const at = p.get("access_token");
      const rt = p.get("refresh_token");
      if (at) {
        const u: SessionUser = { id: 0, email: "", role: "viewer" };
        setSession(at, rt, u);
        window.history.replaceState(null, "", "/login");
        router.push("/");
      }
    }
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await login(email, password);
      if (res.mfa_required && res.mfa_challenge) {
        setChallenge(res.mfa_challenge);
      } else {
        router.push("/");
      }
    } catch (err) {
      setError((err as Error).message || "Invalid credentials");
    } finally {
      setBusy(false);
    }
  }

  async function submitMfa(e: React.FormEvent) {
    e.preventDefault();
    if (!challenge) return;
    setBusy(true);
    setError("");
    try {
      await loginMfa(challenge, code);
      router.push("/");
    } catch (err) {
      setError((err as Error).message || "Invalid code");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm border border-ink p-6 space-y-4">
        <div>
          <div className="text-lg font-bold tracking-wider uppercase">AutoSoc</div>
          <div className="label-cap-muted mt-1">
            {challenge ? "Two-factor authentication" : "Sign in to continue"}
          </div>
        </div>

        {!challenge && (
          <form onSubmit={submit} className="space-y-3" aria-label="Sign in">
            <label className="block">
              <span className="label-cap">Email</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="block w-full mt-1 border border-ink bg-paper px-3 py-2 min-h-[40px]"
                required
              />
            </label>
            <label className="block">
              <span className="label-cap">Password</span>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full mt-1 border border-ink bg-paper px-3 py-2 min-h-[40px]"
                required
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="w-full border border-ink px-3 py-2 min-h-[40px] text-xs uppercase tracking-wider hover:bg-ink hover:text-paper disabled:opacity-50"
            >
              {busy ? "Signing in..." : "Sign in"}
            </button>
          </form>
        )}

        {challenge && (
          <form onSubmit={submitMfa} className="space-y-3" aria-label="MFA challenge">
            <p className="text-sm text-muted">Enter the 6-digit code from your authenticator app.</p>
            <label className="block">
              <span className="label-cap">Code</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
                className="block w-full mt-1 border border-ink bg-paper px-3 py-2 min-h-[40px] tabular-nums tracking-widest text-center text-lg"
                required
                autoFocus
              />
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setChallenge(null); setCode(""); }}
                className="flex-1 border border-ink px-3 py-2 min-h-[40px] text-xs uppercase tracking-wider hover:bg-ink hover:text-paper"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || code.length < 6}
                className="flex-1 border border-ink px-3 py-2 min-h-[40px] text-xs uppercase tracking-wider hover:bg-ink hover:text-paper disabled:opacity-50"
              >
                {busy ? "Verifying..." : "Verify"}
              </button>
            </div>
          </form>
        )}

        {error && (
          <div role="alert" className="border border-ink p-2 text-xs uppercase tracking-wider">
            {error}
          </div>
        )}

        {oidc?.enabled && !challenge && (
          <a
            href="/api/auth/oidc/login"
            className="block text-center border border-ink px-3 py-2 min-h-[40px] text-xs uppercase tracking-wider hover:bg-ink hover:text-paper"
          >
            Sign in with SSO
          </a>
        )}

        {!challenge && (
          <a href="/forgot" className="block text-center label-cap underline">Forgot password?</a>
        )}
      </div>
    </div>
  );
}

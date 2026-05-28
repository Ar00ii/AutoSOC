export interface SessionUser {
  id: number;
  email: string;
  name?: string;
  role: string;
  team_id?: number | null;
  mfa_enabled?: number;
  permissions?: Record<string, string[]>;
}

export function can(resource: string, action: string): boolean {
  const u = getUser();
  if (!u) return true;
  if (u.role === "admin") return true;
  const acts = u.permissions?.[resource];
  if (!acts) return false;
  return acts.includes(action) || acts.includes("*");
}

const TOKEN_KEY = "autosoc.token";
const REFRESH_KEY = "autosoc.refresh";
const USER_KEY = "autosoc.user";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getRefresh(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_KEY);
}

export function setSession(token: string, refresh: string | null | undefined, user: SessionUser) {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, token);
  if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getUser(): SessionUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  return raw ? (JSON.parse(raw) as SessionUser) : null;
}

export function clearSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
}

function authHeaders(init?: RequestInit): RequestInit {
  const token = getToken();
  if (!token) return init || {};
  const headers = new Headers(init?.headers);
  headers.set("authorization", `Bearer ${token}`);
  return { ...init, headers };
}

let refreshing: Promise<boolean> | null = null;
async function tryRefresh(): Promise<boolean> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const rt = getRefresh();
    if (!rt) return false;
    const r = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refresh_token: rt }),
    });
    if (!r.ok) return false;
    const data = await r.json();
    setSession(data.access_token, data.refresh_token, data.user);
    return true;
  })();
  try {
    return await refreshing;
  } finally {
    refreshing = null;
  }
}

async function doFetch(url: string, init?: RequestInit): Promise<Response> {
  let r = await fetch(url, authHeaders(init));
  if (r.status === 401 && getRefresh()) {
    const ok = await tryRefresh();
    if (ok) {
      r = await fetch(url, authHeaders(init));
    }
  }
  if (r.status === 401) {
    clearSession();
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
  }
  return r;
}

export const fetcher = async (url: string) => {
  const r = await doFetch(url);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
};

export async function postJSON<T>(url: string, body?: unknown): Promise<T> {
  const r = await doFetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function patchJSON<T>(url: string, body: unknown): Promise<T> {
  const r = await doFetch(url, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function delJSON(url: string): Promise<void> {
  const r = await doFetch(url, { method: "DELETE" });
  if (!r.ok) throw new Error(await r.text());
}

export interface LoginResponse {
  access_token: string;
  refresh_token?: string | null;
  user: SessionUser;
  mfa_required?: boolean;
  mfa_challenge?: string;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const r = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok) {
    if (r.status === 423) throw new Error("Account locked. Try again later.");
    if (r.status === 429) throw new Error("Too many attempts. Try again in a minute.");
    throw new Error("Invalid credentials");
  }
  const data: LoginResponse = await r.json();
  if (!data.mfa_required) {
    setSession(data.access_token, data.refresh_token ?? null, data.user);
  }
  return data;
}

export async function loginMfa(challenge: string, code: string): Promise<SessionUser> {
  const r = await fetch("/api/auth/login/mfa", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ challenge, code }),
  });
  if (!r.ok) throw new Error("Invalid MFA code");
  const data: LoginResponse = await r.json();
  setSession(data.access_token, data.refresh_token ?? null, data.user);
  return data.user;
}

export async function logout() {
  const rt = getRefresh();
  try {
    await doFetch("/api/auth/logout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refresh_token: rt }),
    });
  } catch {}
  clearSession();
}

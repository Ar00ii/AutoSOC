"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { can, getUser, logout as logoutFn, type SessionUser } from "@/lib/auth";

interface NavItem {
  href: string;
  label: string;
  k: string;
  perm?: [string, string];
}

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "Monitor",
    items: [
      { href: "/", label: "Dashboard", k: "1", perm: ["events", "view"] },
      { href: "/events", label: "Events", k: "2", perm: ["events", "view"] },
      { href: "/cases", label: "Cases", k: "c", perm: ["cases", "view"] },
      { href: "/tickets", label: "Tickets", k: "3", perm: ["tickets", "view"] },
    ],
  },
  {
    group: "Response",
    items: [
      { href: "/blocks", label: "IP Blocks", k: "4", perm: ["blocks", "view"] },
      { href: "/recommendations", label: "Recommendations", k: "5", perm: ["recommendations", "view"] },
    ],
  },
  {
    group: "Automation",
    items: [
      { href: "/playbooks", label: "Playbooks", k: "p", perm: ["playbooks", "view"] },
      { href: "/agents", label: "AI Agents", k: "9", perm: ["agents", "view"] },
      { href: "/agents/runs", label: "Agent Runs", k: "0", perm: ["agents", "view"] },
    ],
  },
  {
    group: "Intel",
    items: [
      { href: "/admin/ti", label: "Threat intel", k: "i", perm: ["ti", "view"] },
      { href: "/reports", label: "Reports", k: "6", perm: ["reports", "view"] },
      { href: "/audit", label: "Audit log", k: "7", perm: ["audit", "view"] },
    ],
  },
  {
    group: "Admin",
    items: [
      { href: "/admin/users", label: "Users", k: "u", perm: ["users", "view"] },
      { href: "/admin/roles", label: "Roles", k: "r", perm: ["roles", "view"] },
      { href: "/admin/teams", label: "Teams", k: "t", perm: ["teams", "view"] },
      { href: "/admin/keys", label: "API Keys", k: "k", perm: ["keys", "view"] },
      { href: "/admin/migrate", label: "Migration", k: "m", perm: ["ingest", "create"] },
      { href: "/admin/rules", label: "Rules", k: "n", perm: ["settings", "view"] },
      { href: "/settings", label: "Settings", k: "8", perm: ["settings", "view"] },
    ],
  },
  {
    group: "You",
    items: [
      { href: "/account", label: "Account", k: "a" },
      { href: "/billing", label: "Billing", k: "b" },
      { href: "/account/sessions", label: "Sessions", k: "s" },
    ],
  },
];

export default function Sidebar() {
  const path = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [, force] = useState(0);

  useEffect(() => {
    setUser(getUser());
    force((x) => x + 1);
  }, [path]);

  async function logout() {
    await logoutFn();
    router.push("/login");
  }

  const visibleGroups = NAV.map((g) => ({
    group: g.group,
    items: g.items.filter((it) => !it.perm || can(it.perm[0], it.perm[1])),
  })).filter((g) => g.items.length > 0);

  return (
    <aside
      aria-label="Primary"
      className="w-[220px] shrink-0 h-screen sticky top-0 border-r border-ink flex flex-col"
    >
      <div className="px-4 py-5 border-b border-ink">
        <div className="text-sm font-bold tracking-wider uppercase">AutoSoc</div>
        <div className="label-cap-muted mt-1">v0.6.0</div>
      </div>
      <nav className="flex-1 overflow-y-auto scrollbar-mono" aria-label="Sections">
        {visibleGroups.map((g) => (
          <div key={g.group} className="border-b border-hair">
            <div className="label-cap-muted px-4 pt-4 pb-2" aria-hidden="true">
              {g.group}
            </div>
            <ul role="list">
              {g.items.map((it) => {
                const active = path === it.href;
                return (
                  <li key={it.href}>
                    <Link
                      href={it.href}
                      aria-current={active ? "page" : undefined}
                      className={
                        "flex items-center justify-between gap-2 px-4 py-2.5 text-sm uppercase tracking-wider min-h-[40px] " +
                        (active
                          ? "bg-ink text-paper"
                          : "hover:bg-ink hover:text-paper")
                      }
                    >
                      <span>{it.label}</span>
                      <span className="label-cap-muted opacity-60">g {it.k}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="px-4 py-3 border-t border-ink label-cap-muted space-y-1">
        {user ? (
          <>
            <div className="truncate">User: {user.email}</div>
            <div>Role: {user.role}</div>
            <button
              type="button"
              onClick={logout}
              className="mt-2 w-full border border-ink px-2 py-1.5 min-h-[28px] text-xs uppercase tracking-wider hover:bg-ink hover:text-paper"
            >
              Sign out
            </button>
          </>
        ) : (
          <Link
            href="/login"
            className="block w-full border border-ink px-2 py-1.5 min-h-[28px] text-xs uppercase tracking-wider hover:bg-ink hover:text-paper text-center"
          >
            Sign in
          </Link>
        )}
        <div className="pt-2">Shortcuts: ? help</div>
      </div>
    </aside>
  );
}

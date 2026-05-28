"use client";

import { useState } from "react";

export interface ParsedFilters {
  severity: string;
  source: string;
  category: string;
  country: string;
  ip: string;
  hours: number;
  text: string;
}

export default function SearchBar({
  onParsed,
}: {
  onParsed: (f: ParsedFilters) => void;
}) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/search/parse?q=${encodeURIComponent(q)}`);
      const parsed: ParsedFilters = await r.json();
      onParsed(parsed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={run}
      className="flex items-stretch border border-ink"
      role="search"
      aria-label="Natural language search"
    >
      <label htmlFor="nl-search" className="sr-only">Natural language search</label>
      <input
        id="nl-search"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="e.g. critical sqli from China last hour"
        className="flex-1 px-3 py-2 min-h-[36px] bg-paper outline-none placeholder:text-muted"
      />
      <button
        type="submit"
        disabled={busy}
        className="border-l border-ink px-4 text-xs uppercase tracking-wider hover:bg-ink hover:text-paper disabled:opacity-50"
      >
        {busy ? "Parsing..." : "Search"}
      </button>
    </form>
  );
}

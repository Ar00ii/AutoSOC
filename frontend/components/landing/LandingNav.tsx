"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 8);
    fn();
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);
  return (
    <header
      className={
        "fixed top-0 left-0 right-0 z-40 bg-paper transition-colors " +
        (scrolled ? "border-b border-ink" : "border-b border-transparent")
      }
    >
      <nav className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/landing" className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 bg-ink" aria-hidden="true" />
          <span className="font-mono font-semibold tracking-widest uppercase text-base">AutoSoc</span>
        </Link>
        <ul className="hidden md:flex items-center gap-6 label-cap-muted">
          <li><Link href="/landing/features" className="hover:text-ink">Features</Link></li>
          <li><Link href="/landing/demo" className="hover:text-ink">Demo</Link></li>
          <li><Link href="/landing/integrations" className="hover:text-ink">Integrations</Link></li>
          <li><Link href="/landing/agents" className="hover:text-ink">Agents</Link></li>
          <li><Link href="/landing/pricing" className="hover:text-ink">Pricing</Link></li>
        </ul>
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="hidden sm:inline-flex items-center h-9 px-3 label-cap hover:bg-row"
          >
            Sign in
          </Link>
          <Link
            href="/"
            className="inline-flex items-center h-9 px-4 bg-ink text-paper text-2xs uppercase tracking-wider"
          >
            Open Console
          </Link>
        </div>
      </nav>
    </header>
  );
}

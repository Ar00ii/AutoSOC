"use client";

import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import Shortcuts from "./Shortcuts";
import CriticalToast from "./CriticalToast";

export default function Chrome({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const standalone = ["/login", "/forgot", "/reset"].includes(path || "");

  if (standalone) {
    return <main id="main" className="min-h-screen">{children}</main>;
  }

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-ink focus:text-paper focus:px-3 focus:py-2 focus:label-cap"
      >
        Skip to main content
      </a>
      <div className="flex min-h-screen">
        <Sidebar />
        <main id="main" className="flex-1 min-w-0">{children}</main>
      </div>
      <Shortcuts />
      <CriticalToast />
    </>
  );
}

"use client";

import { useEffect, useState } from "react";

export default function Topbar({ title }: { title: string }) {
  const [now, setNow] = useState("");
  useEffect(() => {
    const tick = () =>
      setNow(new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC");
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <header className="h-12 border-b border-ink flex items-center justify-between px-6">
      <h1 className="text-sm uppercase tracking-wider font-semibold m-0">{title}</h1>
      <div className="label-cap-muted tabular-nums" aria-live="off">
        <span className="sr-only">Current time: </span>
        {now}
      </div>
    </header>
  );
}

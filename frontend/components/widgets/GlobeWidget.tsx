"use client";

import dynamic from "next/dynamic";
import { WidgetShell } from "./primitives";

// Reuse the existing dashboard globe inside a widget shell.
const Globe = dynamic(() => import("@/components/Globe"), { ssr: false });

export function GlobeWidget() {
  return (
    <WidgetShell title="3D threat globe" subtitle="live arcs">
      <div className="h-full w-full">
        <Globe onIpClick={() => {}} />
      </div>
    </WidgetShell>
  );
}

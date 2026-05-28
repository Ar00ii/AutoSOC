"use client";

import Topbar from "@/components/Topbar";
import DashboardGrid from "@/components/widgets/DashboardGrid";

export default function Dashboard() {
  return (
    <div>
      <Topbar title="Dashboard / Threat overview" />
      <DashboardGrid />
    </div>
  );
}

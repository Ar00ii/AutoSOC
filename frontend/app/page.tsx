"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "@/lib/auth";
import Topbar from "@/components/Topbar";
import DashboardGrid from "@/components/widgets/DashboardGrid";

export default function Dashboard() {
  const router = useRouter();
  const [authed, setAuthed] = useState(false);

  // Anonymous visitors get the public landing page, not the auth-gated
  // dashboard (which would 401 and bounce them to /login). Only mount the
  // dashboard once we know a session token exists.
  useEffect(() => {
    if (getToken()) {
      setAuthed(true);
    } else {
      router.replace("/landing");
    }
  }, [router]);

  if (!authed) return null;

  return (
    <div>
      <Topbar title="Dashboard / Threat overview" />
      <DashboardGrid />
    </div>
  );
}

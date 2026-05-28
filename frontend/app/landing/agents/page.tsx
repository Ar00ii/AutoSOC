import type { Metadata } from "next";
import AgentsShowcase from "@/components/landing/AgentsShowcase";

export const metadata: Metadata = {
  title: "Agents — AutoSoc",
  description: "Autonomous AI agents that triage, enrich and respond to threats around the clock.",
};

export default function AgentsPage() {
  return <AgentsShowcase />;
}

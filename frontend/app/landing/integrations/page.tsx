import type { Metadata } from "next";
import Integrations from "@/components/landing/Integrations";

export const metadata: Metadata = {
  title: "Integrations — AutoSoc",
  description: "Connect AbuseIPDB, SMTP alerts, webhooks and your existing security stack.",
};

export default function IntegrationsPage() {
  return <Integrations />;
}

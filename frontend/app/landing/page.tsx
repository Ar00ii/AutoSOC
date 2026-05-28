import type { Metadata } from "next";
import Hero from "@/components/landing/Hero";
import Marquee from "@/components/landing/Marquee";
import CTA from "@/components/landing/CTA";

export const metadata: Metadata = {
  title: "AutoSoc — The SOC that runs itself",
  description:
    "AI-assisted SIEM with a 3D threat globe, MITRE ATT&CK mapping, AbuseIPDB intel, autonomous agents and a console you can read in one screen.",
};

export default function LandingPage() {
  return (
    <>
      <Hero />
      <Marquee />
      <CTA />
    </>
  );
}

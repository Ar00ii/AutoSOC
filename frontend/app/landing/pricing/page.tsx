import type { Metadata } from "next";
import Pricing from "@/components/landing/Pricing";
import CTA from "@/components/landing/CTA";

export const metadata: Metadata = {
  title: "Pricing — AutoSoc",
  description: "Simple flat monthly plan for AI features. Start free, upgrade when you need AI.",
};

export default function PricingPage() {
  return (
    <>
      <Pricing />
      <CTA />
    </>
  );
}

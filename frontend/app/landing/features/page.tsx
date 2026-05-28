import type { Metadata } from "next";
import Features from "@/components/landing/Features";

export const metadata: Metadata = {
  title: "Features — AutoSoc",
  description:
    "3D threat globe, MITRE ATT&CK mapping, AbuseIPDB intel and a console you can read in one screen.",
};

export default function FeaturesPage() {
  return <Features />;
}

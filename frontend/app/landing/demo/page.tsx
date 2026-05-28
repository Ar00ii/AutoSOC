import type { Metadata } from "next";
import VideoDemo from "@/components/landing/VideoDemo";

export const metadata: Metadata = {
  title: "Demo — AutoSoc",
  description: "Watch AutoSoc in action: live threat globe, agents and automated triage.",
};

export default function DemoPage() {
  return <VideoDemo />;
}

import "./globals.css";
import type { Metadata, Viewport } from "next";
import Chrome from "@/components/Chrome";

export const metadata: Metadata = {
  title: "AutoSoc",
  description: "AI-assisted database and log monitoring",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Chrome>{children}</Chrome>
      </body>
    </html>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useKeyboard } from "@/hooks/useKeyboard";

const ROUTES: Record<string, string> = {
  "1": "/",
  "2": "/events",
  "3": "/tickets",
  "4": "/blocks",
  "5": "/recommendations",
  "6": "/reports",
  "7": "/audit",
  "8": "/settings",
};

export default function Shortcuts() {
  const router = useRouter();
  const [help, setHelp] = useState(false);
  const [prefix, setPrefix] = useState(false);

  useKeyboard([
    { key: "?", handler: () => setHelp((h) => !h), description: "Toggle help" },
    { key: "g", handler: () => setPrefix(true), description: "Go-to prefix" },
    { key: "Escape", handler: () => { setHelp(false); setPrefix(false); }, description: "Close" },
    ...Object.entries(ROUTES).map(([k, href]) => ({
      key: k,
      handler: () => {
        if (prefix) {
          router.push(href);
          setPrefix(false);
        }
      },
      description: `Go to ${href}`,
    })),
  ]);

  return (
    <>
      {prefix && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 border border-ink bg-paper px-4 py-2 label-cap"
        >
          g _ pressed — choose 1-8
        </div>
      )}
      {help && (
        <div
          role="dialog"
          aria-label="Keyboard shortcuts"
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6"
          onClick={() => setHelp(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-paper border border-ink max-w-md w-full p-6"
          >
            <div className="text-sm uppercase tracking-wider font-semibold mb-3">Keyboard shortcuts</div>
            <table className="w-full text-sm">
              <tbody>
                <Row k="?" d="Toggle this dialog" />
                <Row k="g 1" d="Dashboard" />
                <Row k="g 2" d="Events" />
                <Row k="g 3" d="Tickets" />
                <Row k="g 4" d="IP Blocks" />
                <Row k="g 5" d="Recommendations" />
                <Row k="g 6" d="Reports" />
                <Row k="g 7" d="Audit log" />
                <Row k="g 8" d="Settings" />
                <Row k="Esc" d="Close dialogs / panels" />
              </tbody>
            </table>
            <button
              type="button"
              onClick={() => setHelp(false)}
              className="mt-4 border border-ink px-3 py-1.5 min-h-[32px] text-xs uppercase tracking-wider hover:bg-ink hover:text-paper"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function Row({ k, d }: { k: string; d: string }) {
  return (
    <tr className="border-b hair">
      <td className="py-1.5 pr-3 label-cap">{k}</td>
      <td className="py-1.5 text-muted">{d}</td>
    </tr>
  );
}

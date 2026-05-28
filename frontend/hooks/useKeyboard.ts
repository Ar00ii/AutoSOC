"use client";

import { useEffect } from "react";

export interface Shortcut {
  key: string;
  handler: () => void;
  description: string;
  ctrl?: boolean;
}

export function useKeyboard(shortcuts: Shortcut[]) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      for (const s of shortcuts) {
        if (s.key.toLowerCase() === e.key.toLowerCase() && !!s.ctrl === (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          s.handler();
          return;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shortcuts]);
}

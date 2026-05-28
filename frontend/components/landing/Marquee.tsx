"use client";

import { motion } from "framer-motion";

const items = [
  "ingest // SSH",
  "ingest // nginx",
  "ingest // postgres",
  "ingest // syslog",
  "score // Claude Haiku 4.5",
  "report // Claude Sonnet 4.6",
  "map // MITRE ATT&CK",
  "enrich // AbuseIPDB",
  "block // iptables",
  "notify // Slack",
  "auth // OIDC + TOTP",
  "tests // 49 passing",
];

export default function Marquee() {
  return (
    <section
      aria-label="Stack at a glance"
      className="relative border-y border-ink bg-paper py-4 overflow-hidden"
    >
      <motion.div
        className="flex gap-12 whitespace-nowrap"
        animate={{ x: [0, -1200] }}
        transition={{ duration: 40, ease: "linear", repeat: Infinity }}
      >
        {[...items, ...items, ...items].map((t, i) => (
          <span key={i} className="font-mono text-sm tracking-wider uppercase flex items-center gap-12 text-ink">
            <span className="inline-block w-1.5 h-1.5 bg-ink" />
            {t}
          </span>
        ))}
      </motion.div>
    </section>
  );
}

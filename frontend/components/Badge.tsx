import type { Severity } from "@/lib/api";

const CLS: Record<Severity, string> = {
  low: "sev-low",
  medium: "sev-med",
  high: "sev-high",
  critical: "sev-crit",
};

const LABEL: Record<Severity, string> = {
  low: "LOW",
  medium: "MED",
  high: "HIGH",
  critical: "CRIT",
};

export default function Badge({ severity }: { severity: Severity }) {
  return (
    <span
      className={
        "inline-block text-2xs px-2 py-[2px] uppercase tracking-wider " +
        CLS[severity]
      }
    >
      {LABEL[severity]}
    </span>
  );
}

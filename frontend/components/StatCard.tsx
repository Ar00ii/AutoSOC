export default function StatCard({
  label,
  value,
  hint,
  loading = false,
}: {
  label: string;
  value: string | number;
  hint?: string;
  loading?: boolean;
}) {
  return (
    <div className="p-4 bg-paper">
      <div className="label-cap-muted">{label}</div>
      <div
        className="text-2xl font-semibold mt-2 tabular-nums min-h-[32px]"
        aria-live="polite"
      >
        {loading ? <span className="inline-block w-16 h-6 bg-hair" aria-hidden="true" /> : value}
      </div>
      {hint && <div className="label-cap-muted mt-2">{hint}</div>}
    </div>
  );
}

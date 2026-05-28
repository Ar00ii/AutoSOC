"use client";

export default function TopList({
  title,
  items,
  onItemClick,
}: {
  title: string;
  items: { key: string; count: number }[];
  onItemClick?: (key: string) => void;
}) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <div className="border border-ink p-3">
      <div className="label-cap mb-2">{title}</div>
      <ul className="space-y-1">
        {items.length === 0 && <li className="label-cap-muted">No data</li>}
        {items.map((it) => {
          const w = Math.round((it.count / max) * 100);
          const content = (
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="truncate font-medium tabular-nums">{it.key || "-"}</span>
              <span className="tabular-nums">{it.count}</span>
            </div>
          );
          return (
            <li key={it.key} className="relative">
              <div
                aria-hidden="true"
                className="absolute inset-y-0 left-0 bg-hair"
                style={{ width: `${w}%` }}
              />
              <div className="relative px-2 py-1.5">
                {onItemClick ? (
                  <button
                    type="button"
                    onClick={() => onItemClick(it.key)}
                    className="w-full text-left hover:bg-ink hover:text-paper"
                  >
                    {content}
                  </button>
                ) : (
                  content
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

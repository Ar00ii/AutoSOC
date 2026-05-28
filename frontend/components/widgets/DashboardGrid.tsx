"use client";

import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { Responsive, WidthProvider, type Layout } from "react-grid-layout";
import { fetcher, post, patch, del } from "@/lib/api";
import { renderWidget } from "./registry";

const RGL = WidthProvider(Responsive);

interface WidgetPlacement {
  i: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  // Optional per-widget overrides (custom title, hidden, etc.)
  title?: string;
  hidden?: boolean;
}

interface LayoutDoc {
  id: number;
  name: string;
  is_default: boolean;
  widgets: WidgetPlacement[];
}

interface CatalogEntry {
  type: string;
  name: string;
  group: string;
  default_w: number;
  default_h: number;
  desc: string;
}

interface Template {
  id: string;
  name: string;
  description: string;
  widget_count: number;
}

const DEFAULT_LAYOUT: WidgetPlacement[] = [
  { i: "w1",  type: "kpi_events_24h",          x: 0,  y: 0,  w: 3, h: 2 },
  { i: "w2",  type: "kpi_critical_24h",        x: 3,  y: 0,  w: 3, h: 2 },
  { i: "w3",  type: "kpi_open_cases",          x: 6,  y: 0,  w: 3, h: 2 },
  { i: "w4",  type: "kpi_blocked_ips",         x: 9,  y: 0,  w: 3, h: 2 },
  { i: "w5",  type: "globe_3d",                x: 0,  y: 2,  w: 6, h: 6 },
  { i: "w6",  type: "chart_events_per_hour",   x: 6,  y: 2,  w: 6, h: 4 },
  { i: "w7",  type: "chart_severity_donut",    x: 6,  y: 6,  w: 3, h: 4 },
  { i: "w8",  type: "chart_top_categories",    x: 9,  y: 6,  w: 3, h: 4 },
  { i: "w9",  type: "stream_recent_events",    x: 0,  y: 8,  w: 6, h: 5 },
  { i: "w10", type: "stream_open_cases",       x: 6,  y: 10, w: 6, h: 4 },
  { i: "w11", type: "chart_killchain",         x: 0,  y: 13, w: 6, h: 3 },
  { i: "w12", type: "stream_approval_queue",   x: 6,  y: 14, w: 6, h: 3 },
];

export default function DashboardGrid() {
  const { data: layouts, mutate } = useSWR<LayoutDoc[]>("/api/dashboard/layouts", fetcher);
  const { data: catalog } = useSWR<{ widgets: CatalogEntry[] }>("/api/dashboard/layouts/_catalog", fetcher);
  const { data: templates } = useSWR<{ templates: Template[] }>("/api/dashboard/layouts/_templates", fetcher);

  const [activeId, setActiveId] = useState<number | null>(null);
  const [edit, setEdit] = useState(false);
  const [showCatalog, setShowCatalog] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [configWidget, setConfigWidget] = useState<WidgetPlacement | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  // Pick the user's default, else the first layout
  useEffect(() => {
    if (!layouts) return;
    if (activeId && layouts.find((l) => l.id === activeId)) return;
    const def = layouts.find((l) => l.is_default) || layouts[0];
    setActiveId(def?.id ?? null);
  }, [layouts, activeId]);

  // Keyboard: 'e' toggles edit (ignored if focused in input/textarea)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return;
      if (e.key === "e" && !e.metaKey && !e.ctrlKey) setEdit((x) => !x);
      if (e.key === "Escape") {
        setShowCatalog(false);
        setShowTemplates(false);
        setConfigWidget(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const active = layouts?.find((l) => l.id === activeId) || null;
  const widgets = active?.widgets?.length ? active.widgets : DEFAULT_LAYOUT;

  async function ensureLayout(newWidgets: WidgetPlacement[]): Promise<LayoutDoc> {
    if (active) {
      const updated = await patch(`/api/dashboard/layouts/${active.id}`, {
        name: active.name, widgets: newWidgets, is_default: active.is_default,
      });
      mutate();
      return updated;
    }
    const created = await post("/api/dashboard/layouts", {
      name: "Default", widgets: newWidgets, is_default: true,
    });
    mutate();
    setActiveId(created.id);
    return created;
  }

  function onLayoutChange(_lay: Layout[], allLayouts: { lg: Layout[] }) {
    if (!edit) return;
    const lg = allLayouts.lg || _lay;
    const merged: WidgetPlacement[] = widgets.map((w) => {
      const l = lg.find((x) => x.i === w.i);
      return l ? { ...w, x: l.x, y: l.y, w: l.w, h: l.h } : w;
    });
    ensureLayout(merged);
  }

  function addWidget(entry: CatalogEntry) {
    const i = `w_${Date.now().toString(36)}`;
    const maxY = widgets.length ? Math.max(...widgets.map((w) => w.y + w.h)) : 0;
    const next: WidgetPlacement = {
      i, type: entry.type, x: 0, y: maxY,
      w: entry.default_w, h: entry.default_h,
    };
    ensureLayout([...widgets, next]);
    setShowCatalog(false);
  }

  function removeWidget(i: string) {
    ensureLayout(widgets.filter((w) => w.i !== i));
  }

  function updateWidget(i: string, patch: Partial<WidgetPlacement>) {
    ensureLayout(widgets.map((w) => (w.i === i ? { ...w, ...patch } : w)));
  }

  async function newLayout() {
    const name = prompt("Name this layout (e.g. Threat hunting, Compliance):");
    if (!name) return;
    const created = await post("/api/dashboard/layouts", {
      name, widgets: DEFAULT_LAYOUT, is_default: false,
    });
    mutate();
    setActiveId(created.id);
  }

  async function forkTemplate(tplId: string) {
    const created = await post("/api/dashboard/layouts/_fork_template", { template_id: tplId });
    mutate();
    setActiveId(created.id);
    setShowTemplates(false);
  }

  async function deleteLayout() {
    if (!active) return;
    if (!confirm(`Delete layout "${active.name}"?`)) return;
    await del(`/api/dashboard/layouts/${active.id}`);
    setActiveId(null);
    mutate();
  }

  async function setAsDefault() {
    if (!active) return;
    await patch(`/api/dashboard/layouts/${active.id}`, {
      name: active.name, widgets: active.widgets, is_default: true,
    });
    mutate();
  }

  async function exportLayout() {
    if (!active) return;
    const blob = await fetch(`/api/dashboard/layouts/${active.id}/_export`).then((r) => r.blob());
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `autosoc-layout-${active.name.replace(/\s+/g, "_").toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function triggerImport() {
    importInputRef.current?.click();
  }
  async function onImportFile(file: File) {
    try {
      const text = await file.text();
      const obj = JSON.parse(text);
      const created = await post("/api/dashboard/layouts/_import", {
        schema: obj.schema || "autosoc.dashboard_layout.v1",
        name: obj.name || file.name.replace(/\.json$/i, ""),
        widgets: obj.widgets || [],
      });
      mutate();
      setActiveId(created.id);
    } catch (e) {
      alert("Import failed: " + (e as Error).message);
    }
  }

  return (
    <div className="p-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <select
          value={activeId ?? ""}
          onChange={(e) => setActiveId(e.target.value ? Number(e.target.value) : null)}
          className="border border-ink bg-paper px-2 py-1 text-xs uppercase tracking-wider"
        >
          {(layouts ?? []).map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}{l.is_default ? " · default" : ""}
            </option>
          ))}
          {(!layouts || layouts.length === 0) && <option value="">Default</option>}
        </select>
        <button onClick={() => setShowTemplates(true)}
          className="border border-ink px-2 py-1 text-xs uppercase tracking-wider">
          from template
        </button>
        <button onClick={newLayout}
          className="border border-ink px-2 py-1 text-xs uppercase tracking-wider">
          + new
        </button>
        {active && !active.is_default && (
          <button onClick={setAsDefault}
            className="border border-ink px-2 py-1 text-xs uppercase tracking-wider">
            set default
          </button>
        )}
        {active && (
          <>
            <button onClick={exportLayout}
              className="border border-ink px-2 py-1 text-xs uppercase tracking-wider">
              export
            </button>
            <button onClick={triggerImport}
              className="border border-ink px-2 py-1 text-xs uppercase tracking-wider">
              import
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onImportFile(e.target.files[0])}
            />
            <button onClick={deleteLayout}
              className="border border-ink px-2 py-1 text-xs uppercase tracking-wider">
              delete
            </button>
          </>
        )}
        <span className="label-cap-muted ml-2">{widgets.length} widgets</span>
        <span className="label-cap-muted">[e] edit</span>
        <div className="ml-auto flex items-center gap-2">
          {edit && (
            <button onClick={() => setShowCatalog(true)}
              className="bg-ink text-paper px-3 py-1 text-xs uppercase tracking-wider">
              + add widget
            </button>
          )}
          <button onClick={() => setEdit((e) => !e)}
            className={"px-3 py-1 text-xs uppercase tracking-wider " + (edit ? "bg-ink text-paper" : "border border-ink")}>
            {edit ? "done" : "edit layout"}
          </button>
        </div>
      </div>

      {/* Grid */}
      <RGL
        className={"layout " + (edit ? "edit-mode" : "")}
        layouts={{
          lg: widgets.map((w) => ({ i: w.i, x: w.x, y: w.y, w: w.w, h: w.h, minW: 2, minH: 2 })),
        }}
        breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
        cols={{ lg: 12, md: 12, sm: 8, xs: 4, xxs: 2 }}
        rowHeight={56}
        margin={[12, 12]}
        isDraggable={edit}
        isResizable={edit}
        draggableHandle=".widget-drag-handle"
        onLayoutChange={onLayoutChange}
        compactType="vertical"
      >
        {widgets.map((w) => (
          <div key={w.i} className="relative">
            {edit && (
              <>
                <button
                  onClick={() => setConfigWidget(w)}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="absolute -top-2 -right-9 z-20 w-5 h-5 bg-paper border border-ink text-[10px] leading-none flex items-center justify-center hover:bg-ink hover:text-paper"
                  aria-label="configure widget"
                >
                  ⋯
                </button>
                <button
                  onClick={() => removeWidget(w.i)}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="absolute -top-2 -right-2 z-20 w-5 h-5 bg-paper border border-ink text-xs leading-none flex items-center justify-center hover:bg-ink hover:text-paper"
                  aria-label="remove widget"
                >
                  ×
                </button>
              </>
            )}
            {renderWidget(w.type)}
          </div>
        ))}
      </RGL>

      {/* Catalog modal */}
      {showCatalog && (
        <Modal title="Widget catalog" onClose={() => setShowCatalog(false)}>
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-2">
            {(catalog?.widgets ?? []).map((w) => (
              <button
                key={w.type}
                onClick={() => addWidget(w)}
                className="text-left border border-ink p-3 hover:bg-row group"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-semibold">{w.name}</span>
                  <span className="label-cap-muted">{w.group} · {w.default_w}×{w.default_h}</span>
                </div>
                <div className="text-xs text-muted mt-1">{w.desc}</div>
              </button>
            ))}
          </div>
        </Modal>
      )}

      {/* Templates modal */}
      {showTemplates && (
        <Modal title="Layout templates" onClose={() => setShowTemplates(false)}>
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-2">
            {(templates?.templates ?? []).map((t) => (
              <button
                key={t.id}
                onClick={() => forkTemplate(t.id)}
                className="text-left border border-ink p-4 hover:bg-row"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-semibold">{t.name}</span>
                  <span className="label-cap-muted">{t.widget_count} widgets</span>
                </div>
                <div className="text-xs text-muted mt-1">{t.description}</div>
              </button>
            ))}
          </div>
        </Modal>
      )}

      {/* Per-widget config modal */}
      {configWidget && (
        <Modal title={`Configure · ${configWidget.type}`} onClose={() => setConfigWidget(null)}>
          <div className="p-4 space-y-3 max-w-md">
            <div>
              <div className="label-cap-muted mb-1">Custom title</div>
              <input
                defaultValue={configWidget.title || ""}
                onBlur={(e) =>
                  updateWidget(configWidget.i, { title: e.target.value || undefined })
                }
                placeholder="(leave empty for default)"
                className="w-full border border-ink bg-paper px-2 py-1 text-sm font-mono"
              />
            </div>
            <div>
              <div className="label-cap-muted mb-1">Position</div>
              <div className="font-mono text-xs tabular-nums">
                col {configWidget.x} · row {configWidget.y} · w {configWidget.w} · h {configWidget.h}
              </div>
            </div>
            <div className="border-t hair pt-3">
              <button
                onClick={() => {
                  removeWidget(configWidget.i);
                  setConfigWidget(null);
                }}
                className="bg-ink text-paper px-3 py-1.5 text-xs uppercase tracking-wider"
              >
                Remove widget
              </button>
            </div>
          </div>
        </Modal>
      )}

      <style jsx global>{`
        .react-grid-item.react-grid-placeholder {
          background: rgba(0, 0, 0, 0.08) !important;
          border: 1px dashed #000;
          opacity: 1 !important;
        }
        .react-grid-item > .react-resizable-handle {
          opacity: 0;
          transition: opacity 120ms ease;
        }
        .edit-mode .react-grid-item > .react-resizable-handle {
          opacity: 0.5;
        }
        .react-grid-item > .react-resizable-handle::after {
          border-color: #000;
        }
      `}</style>
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-paper border border-ink max-w-3xl w-full max-h-[80vh] overflow-y-auto scrollbar-mono"
      >
        <div className="px-4 py-3 border-b border-ink flex items-center justify-between">
          <div className="label-cap">{title}</div>
          <button onClick={onClose} className="label-cap-muted">close [esc]</button>
        </div>
        {children}
      </div>
    </div>
  );
}

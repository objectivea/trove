"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Reference } from "@/lib/types";
import { hexToRgb } from "@/lib/palette";

type Mode = "spiral" | "cluster" | "colour" | "time";
const LABEL: Record<Mode, string> = { spiral: "Spiral", cluster: "Similarity", colour: "Colour", time: "Time" };

/** Hue of a reference's dominant swatch, used by the colour arrangement. */
function hueOf(ref: Reference): number {
  const hex = ref.palette[0]?.hex;
  if (!hex) return 0;
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (!d) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

export function ExploreCanvas({ references, clusters }: {
  references: Reference[];
  clusters: { id: string; name: string; size: number }[];
}) {
  const router = useRouter();
  const stage = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>("spiral");
  const [view, setView] = useState({ z: 1, tx: 0, ty: 0 });
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<Reference | null>(null);
  const [size, setSize] = useState({ w: 1200, h: 700 });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const measure = () => {
      const r = stage.current?.getBoundingClientRect();
      if (r) setSize({ w: r.width, h: r.height });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const positions = useMemo(() => {
    const n = references.length || 1;
    const R = Math.min(size.w / 2.7, size.h / 2.05);
    const out = new Map<string, { x: number; y: number }>();

    if (mode === "spiral") {
      references.forEach((ref, i) => {
        const t = i / Math.max(1, n - 1);
        const a = t * 3.15 * Math.PI * 2;
        const r = (0.07 + 0.93 * Math.sqrt(t)) * R;
        out.set(ref.id, { x: Math.cos(a) * r * 1.5, y: Math.sin(a) * r });
      });
    } else if (mode === "colour") {
      references.forEach((ref, i) => {
        const a = (hueOf(ref) / 360) * Math.PI * 2 - Math.PI / 2;
        const r = (0.3 + ((i * 37) % 100) / 140) * R;
        out.set(ref.id, { x: Math.cos(a) * r * 1.5, y: Math.sin(a) * r });
      });
    } else if (mode === "time") {
      const cols = 10;
      const sorted = [...references].sort((a, b) => (a.savedAt ?? a.createdAt) - (b.savedAt ?? b.createdAt));
      const per = Math.ceil(sorted.length / cols);
      sorted.forEach((ref, i) => {
        const col = Math.floor(i / per);
        const row = i % per;
        out.set(ref.id, {
          x: -size.w / 2 + 80 + col * ((size.w - 160) / Math.max(1, cols - 1)),
          y: (row - per / 2) * 30,
        });
      });
    } else {
      const groups: (string | null)[] = clusters.length ? clusters.map((c) => c.id) : [null];
      references.forEach((ref, i) => {
        const gi = Math.max(0, groups.indexOf(ref.clusterId));
        const ga = (gi / groups.length) * Math.PI * 2 - Math.PI / 2;
        const cx = Math.cos(ga) * R * 0.92 * 1.45;
        const cy = Math.sin(ga) * R * 0.78;
        const a = ((i * 2654435761) % 1000) / 1000 * Math.PI * 2;
        const rad = Math.sqrt(((i * 40503) % 1000) / 1000) * R * 0.42;
        out.set(ref.id, { x: cx + Math.cos(a) * rad * 1.25, y: cy + Math.sin(a) * rad });
      });
    }
    return out;
  }, [references, clusters, mode, size]);

  /* zoom anchored to the pointer, not the centre of the stage */
  const zoomAt = useCallback((nz: number, sx?: number, sy?: number) => {
    const r = stage.current?.getBoundingClientRect();
    if (!r) return;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const px = sx ?? cx, py = sy ?? cy;
    setView((v) => {
      const z = Math.max(0.35, Math.min(2.6, nz));
      if (z === v.z) return v;
      const wx = (px - cx - v.tx) / v.z;
      const wy = (py - cy - v.ty) / v.z;
      return { z, tx: px - cx - wx * z, ty: py - cy - wy * z };
    });
  }, []);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(view.z * Math.pow(0.9988, e.deltaY), e.clientX, e.clientY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt, view.z]);

  const drag = useRef<{ x: number; y: number; pan: boolean; tx: number; ty: number } | null>(null);

  function onDown(e: React.PointerEvent) {
    const r = stage.current!.getBoundingClientRect();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = {
      x: e.clientX - r.left, y: e.clientY - r.top,
      pan: e.shiftKey || e.button === 1, tx: view.tx, ty: view.ty,
    };
    if (!drag.current.pan) { setBox({ x: drag.current.x, y: drag.current.y, w: 0, h: 0 }); setPicked(new Set()); }
  }

  function onMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const r = stage.current!.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    if (d.pan) {
      setView((v) => ({ ...v, tx: d.tx + (x - d.x), ty: d.ty + (y - d.y) }));
    } else {
      setBox({ x: Math.min(x, d.x), y: Math.min(y, d.y), w: Math.abs(x - d.x), h: Math.abs(y - d.y) });
    }
  }

  function onUp() {
    const d = drag.current;
    drag.current = null;
    if (!d || d.pan || !box) { setBox(null); return; }
    if (box.w < 18 || box.h < 14) { setBox(null); return; }

    const r = stage.current!.getBoundingClientRect();
    const cx = r.width / 2, cy = r.height / 2;
    const hit = new Set<string>();
    for (const ref of references) {
      const p = positions.get(ref.id);
      if (!p) continue;
      const sx = cx + view.tx + p.x * view.z;
      const sy = cy + view.ty + p.y * view.z;
      if (sx >= box.x && sx <= box.x + box.w && sy >= box.y && sy <= box.y + box.h) hit.add(ref.id);
    }
    setPicked(hit);
    setBox(null);
  }

  async function makeBoard() {
    if (!picked.size) return;
    setBusy(true);
    try {
      const res = await fetch("/api/boards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ referenceIds: [...picked] }),
      });
      const data = await res.json() as any;
      if (data.id) router.push(`/boards/${data.id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 92px)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 18, padding: "13px 40px", borderBottom: "1px solid var(--ink)", flexWrap: "wrap" }}>
        <span className="lbl">Arrange by</span>
        {(Object.keys(LABEL) as Mode[]).map((m) => (
          <button key={m} className="brk" aria-pressed={mode === m} onClick={() => { setMode(m); setPicked(new Set()); }}>
            {LABEL[m]}
          </button>
        ))}
        <div style={{ flexGrow: 1 }} />
        <span className="lbl">Zoom</span>
        <button className="btn" style={{ padding: "3px 9px" }} onClick={() => zoomAt(view.z / 1.18)}>&minus;</button>
        <span style={{ fontSize: 11, minWidth: 42, textAlign: "center" }}>{Math.round(view.z * 100)}%</span>
        <button className="btn" style={{ padding: "3px 9px" }} onClick={() => zoomAt(view.z * 1.18)}>+</button>
      </div>

      <div
        ref={stage}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        style={{ position: "relative", flexGrow: 1, overflow: "hidden", cursor: "crosshair", touchAction: "none" }}
      >
        <div
          style={{
            position: "absolute", inset: 0,
            transform: `translate3d(${view.tx}px, ${view.ty}px, 0) scale(${view.z})`,
            transition: drag.current ? "none" : "transform 420ms cubic-bezier(.16,1,.3,1)",
          }}
        >
          {references.map((ref, i) => {
            const p = positions.get(ref.id) ?? { x: 0, y: 0 };
            const on = picked.size === 0 || picked.has(ref.id);
            const w = 30 + ((i * 17) % 22);
            return (
              <div
                key={ref.id}
                onMouseEnter={() => setHover(ref)}
                onClick={() => picked.size === 0 && router.push(`/reference/${ref.id}`)}
                className={`t${ref.mediaKey ? "" : " ph"}`}
                style={{
                  position: "absolute", left: "50%", top: "50%",
                  width: w, height: Math.round(w * 0.78),
                  marginLeft: -w / 2, marginTop: -w * 0.39,
                  transform: `translate3d(${Math.round(p.x)}px, ${Math.round(p.y)}px, 0)`,
                  transition: "transform 900ms cubic-bezier(.16,1,.3,1), opacity 380ms linear",
                  transitionDelay: `${(i % 36) * 9}ms`,
                  opacity: on ? 1 : 0.18,
                  outline: picked.has(ref.id) ? "1px solid var(--signal)" : undefined,
                  backgroundImage: ref.mediaKey ? `url(/api/media/${ref.mediaKey})` : undefined,
                  cursor: "pointer",
                }}
              />
            );
          })}
        </div>

        {box && (
          <div style={{ position: "absolute", left: box.x, top: box.y, width: box.w, height: box.h, border: "1px dashed var(--signal)", pointerEvents: "none" }} />
        )}

        {picked.size > 0 && (
          <div style={{ position: "absolute", left: 40, bottom: 24, display: "flex", gap: 8 }}>
            <button className="btn k" onClick={makeBoard} disabled={busy}>
              {busy ? "Writing the direction…" : `Make a board · ${picked.size}`}
            </button>
            <button className="btn" onClick={() => setPicked(new Set())}>Clear</button>
          </div>
        )}
      </div>

      <div className="leader" style={{ padding: "11px 40px 14px", borderTop: "1px solid var(--ink)" }}>
        <span style={{ fontSize: 10, color: "var(--ink)" }}>
          {hover ? `${hover.filename}${hover.ident.maker ? ` · ${hover.ident.maker}` : ""}` : "Drag to lasso · shift-drag to pan · scroll to zoom"}
        </span>
        <span className="dot" />
        <span className="lbl">{references.length} shown · {picked.size} selected</span>
      </div>
    </div>
  );
}

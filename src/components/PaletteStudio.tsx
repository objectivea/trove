"use client";

import { useMemo, useState } from "react";
import type { Reference, Swatch } from "@/lib/types";
import { contrastRatio, hexToRgb, wcagLabel } from "@/lib/palette";

/**
 * Colour as a first-class object. Swatches are read back out of references that
 * already carry a palette, so building one costs nothing; locking a swatch keeps
 * it while the rest re-read from a different source.
 */
export function PaletteStudio({ references }: { references: Reference[] }) {
  const [count, setCount] = useState(6);
  const [locked, setLocked] = useState<Swatch[]>([]);
  const [sourceIds, setSourceIds] = useState<string[]>(references.slice(0, 6).map((r) => r.id));

  const sources = references.filter((r) => sourceIds.includes(r.id));

  const swatches = useMemo(() => {
    const pool = new Map<string, Swatch>();
    for (const s of locked) pool.set(s.hex, { ...s, locked: true });

    // merge the palettes of the chosen references, weighting by how much area each covers
    const tally = new Map<string, Swatch>();
    for (const ref of sources) {
      for (const p of ref.palette) {
        const cur = tally.get(p.hex);
        if (cur) cur.share += p.share;
        else tally.set(p.hex, { ...p });
      }
    }

    const ranked = [...tally.values()].sort((a, b) => b.share - a.share);
    for (const s of ranked) {
      if (pool.size >= count) break;
      if (!pool.has(s.hex)) pool.set(s.hex, s);
    }

    const total = [...pool.values()].reduce((n, s) => n + s.share, 0) || 1;
    return [...pool.values()].map((s) => ({ ...s, share: s.share / total }));
  }, [sources, locked, count]);

  const pairs = useMemo(() => {
    const out: { a: string; b: string; ratio: number }[] = [];
    for (let i = 0; i < swatches.length && out.length < 4; i++) {
      for (let j = i + 1; j < swatches.length && out.length < 4; j++) {
        out.push({
          a: swatches[i].hex,
          b: swatches[j].hex,
          ratio: contrastRatio(hexToRgb(swatches[i].hex), hexToRgb(swatches[j].hex)),
        });
      }
    }
    return out.sort((x, y) => y.ratio - x.ratio);
  }, [swatches]);

  function toggleLock(s: Swatch) {
    setLocked((prev) =>
      prev.some((p) => p.hex === s.hex) ? prev.filter((p) => p.hex !== s.hex) : [...prev, s]
    );
  }

  const hexList = swatches.map((s) => s.hex.toUpperCase()).join("\n");
  const cssVars = swatches
    .map((s, i) => `  --swatch-${i + 1}: ${s.hex}; /* ${s.name} */`)
    .join("\n");

  if (!references.length) {
    return (
      <p style={{ marginTop: 30, fontSize: 12, lineHeight: 1.9, color: "var(--mid)", maxWidth: 560 }}>
        No palettes yet — they come out of the pixels when you add references.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", gap: 0, marginTop: 22, alignItems: "flex-start", flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 640px", minWidth: 0, paddingRight: 34 }}>
        <div className="leader">
          <span className="lbl ink">{swatches.length} swatches</span>
          <span className="dash" />
          <span className="lbl">Read from {sources.length} references</span>
        </div>

        <div style={{ display: "flex", marginTop: 20 }}>
          {swatches.map((s) => (
            <div key={s.hex} style={{ flex: 1, height: 250, background: s.hex }} />
          ))}
        </div>

        <div style={{ display: "flex", marginTop: 10 }}>
          {swatches.map((s) => (
            <div key={s.hex} style={{ flex: 1, paddingRight: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700 }}>{s.hex.replace("#", "").toUpperCase()}</div>
              <div className="fn" style={{ marginTop: 4 }}>{s.name}</div>
              <button
                className="brk"
                onClick={() => toggleLock(s)}
                aria-pressed={Boolean(s.locked)}
                style={{ marginTop: 5, fontSize: 9 }}
              >
                {s.locked ? "■ locked" : "□ lock"}
              </button>
              <div className="fn" style={{ marginTop: 2 }}>{Math.round(s.share * 100)}%</div>
            </div>
          ))}
        </div>

        <div className="leader" style={{ marginTop: 26 }}>
          <span className="lbl ink">Picked from</span>
          <span className="dash" />
          <span className="lbl">Click to include or drop a reference</span>
        </div>

        <div style={{ display: "flex", gap: 14, marginTop: 14, flexWrap: "wrap" }}>
          {references.slice(0, 18).map((r) => {
            const on = sourceIds.includes(r.id);
            return (
              <button
                key={r.id}
                onClick={() => setSourceIds((prev) => on ? prev.filter((id) => id !== r.id) : [...prev, r.id])}
                style={{ border: 0, background: "none", padding: 0, cursor: "pointer", opacity: on ? 1 : 0.3 }}
                aria-pressed={on}
              >
                <div
                  className={`t${r.mediaKey ? "" : " ph"}`}
                  style={{
                    width: 128, height: 88,
                    outline: on ? "1px solid var(--ink)" : undefined,
                    backgroundImage: r.mediaKey ? `url(/api/media/${r.mediaKey})` : undefined,
                  }}
                />
                <div className="fn" style={{ textAlign: "left" }}>{r.filename}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ width: 340, flexShrink: 0, borderLeft: "1px solid var(--ink)", paddingLeft: 34 }}>
        <div className="lbl ink">[ Build ]</div>

        <div className="leader" style={{ marginTop: 22 }}>
          <span className="lbl">Swatches</span>
          <span className="dot" />
          <span style={{ fontSize: 12 }}>
            <button className="brk" onClick={() => setCount((c) => Math.max(3, c - 1))}>&minus;</button>
            &nbsp;{count}&nbsp;
            <button className="brk" onClick={() => setCount((c) => Math.min(10, c + 1))}>+</button>
          </span>
        </div>

        <div style={{ marginTop: 24, paddingTop: 18, borderTop: "1px solid var(--ink)" }}>
          <div className="lbl" style={{ marginBottom: 11 }}>Contrast check</div>
          {pairs.map((p) => {
            const label = wcagLabel(p.ratio);
            return (
              <div className="leader" key={`${p.a}-${p.b}`} style={{ marginBottom: 9 }}>
                <span style={{ fontSize: 10 }}>
                  {p.a.replace("#", "").toUpperCase()} on {p.b.replace("#", "").toUpperCase()}
                </span>
                <span className="dot" />
                <span style={{ fontSize: 10, color: label === "Fails" ? "var(--signal)" : "var(--ink)" }}>{label}</span>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 24, paddingTop: 18, borderTop: "1px solid var(--ink)" }}>
          <div className="lbl" style={{ marginBottom: 11 }}>Export</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn" onClick={() => navigator.clipboard?.writeText(hexList)}>Hex list</button>
            <button className="btn" onClick={() => navigator.clipboard?.writeText(`:root {\n${cssVars}\n}`)}>CSS variables</button>
          </div>
          <div className="fn" style={{ marginTop: 10 }}>Copied to the clipboard.</div>
        </div>
      </div>
    </div>
  );
}

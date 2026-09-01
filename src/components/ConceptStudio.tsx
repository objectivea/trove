"use client";

import { useState } from "react";
import type { Reference } from "@/lib/types";

/**
 * The stage after the mood board. The brief goes in as plain language; the board's
 * own reference images go to the model alongside it, so what comes back is the
 * project in this board's visual language.
 */
export function ConceptStudio({ board, items, concepts: initial }: {
  board: { id: string; narrative: string | null };
  items: Reference[];
  concepts: any[];
}) {
  const [brief, setBrief] = useState("");
  const [concepts, setConcepts] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dna = [...new Set(items.flatMap((r) => r.style))].slice(0, 6);

  async function generate() {
    if (!brief.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/concept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ boardId: board.id, brief }),
      });
      const data = await res.json() as any;
      if (!res.ok) setError(data.error ?? "Generation failed");
      else if (!data.generated) setError("The model returned no images. Check the Gemini key and quota.");
      else setConcepts((c) => [...c, ...data.concepts]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: 0, marginTop: 22, alignItems: "flex-start", flexWrap: "wrap" }}>
      <div style={{ width: 420, flexShrink: 0, paddingRight: 34, borderRight: "1px solid var(--ink)" }}>
        <div className="leader">
          <span className="lbl ink">Style DNA</span>
          <span className="dash" />
          <span className="lbl">{items.length} refs</span>
        </div>

        <div style={{ display: "flex", gap: 5, marginTop: 13, flexWrap: "wrap" }}>
          {items.slice(0, 6).map((r) => (
            <div
              key={r.id}
              className={`t${r.mediaKey ? "" : " ph"}`}
              style={{ width: 44, height: 44, backgroundImage: r.mediaKey ? `url(/api/media/${r.mediaKey})` : undefined }}
            />
          ))}
          {items.length > 6 && (
            <div style={{ width: 44, height: 44, border: "1px dashed var(--mid)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "var(--mid)" }}>
              +{items.length - 6}
            </div>
          )}
        </div>

        {dna.length > 0 && (
          <div style={{ fontSize: 10, letterSpacing: ".06em", textTransform: "uppercase", marginTop: 13, lineHeight: 1.9 }}>
            {dna.map((d) => `[ ${d} ]`).join(" ")}
          </div>
        )}

        <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--ink)" }}>
          <div className="lbl" style={{ marginBottom: 10 }}>The project</div>
          <textarea
            className="field"
            rows={6}
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="Launch dinner for 40. Warehouse space in Hackney, mid-October, 7pm. Long shared tables, low light, nothing precious."
          />
          <div className="fn" style={{ marginTop: 8 }}>
            Paste a brief from Obsidian, or write it here.
          </div>
          <button className="btn k" onClick={generate} disabled={busy || !brief.trim()} style={{ marginTop: 14 }}>
            {busy ? "Generating…" : "Generate concepts"}
          </button>
          {error && <div className="fn" style={{ color: "var(--signal)", marginTop: 10 }}>{error}</div>}
        </div>
      </div>

      <div style={{ flexGrow: 1, minWidth: 0, paddingLeft: 34 }}>
        <div className="leader">
          <span className="lbl ink">Concepts</span>
          <span className="dash" />
          <span className="lbl">Generated from this board&rsquo;s references &middot; not photographs</span>
        </div>

        {concepts.length === 0 ? (
          <p style={{ fontSize: 11.5, lineHeight: 1.9, color: "var(--mid)", marginTop: 20, maxWidth: 520 }}>
            Nothing generated yet. Describe the project on the left and the board&rsquo;s palette,
            light and materials go to the model along with the words.
          </p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 22, marginTop: 20 }}>
            {concepts.map((c: any, i: number) => (
              <div key={c.id ?? i}>
                <div
                  className="t"
                  style={{ height: 260, backgroundImage: c.media_key || c.mediaKey ? `url(/api/media/${c.media_key ?? c.mediaKey})` : undefined }}
                />
                <div className="leader" style={{ marginTop: 7 }}>
                  <span className="fn" style={{ margin: 0 }}>{String(i + 1).padStart(2, "0")}</span>
                  <span className="dot" />
                  <span className="fn" style={{ margin: 0 }}>{c.filename}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

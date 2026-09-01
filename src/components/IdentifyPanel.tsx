"use client";

import { useState } from "react";
import type { Reference } from "@/lib/types";

/**
 * The catalogue record. Facts the AI could not establish stay empty and say so —
 * inventing a photographer would be worse than leaving the field blank.
 */
export function IdentifyPanel({ reference }: { reference: Reference }) {
  const [ident, setIdent] = useState(reference.ident);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function identify() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/identify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: reference.id }),
      });
      const data = await res.json() as any;
      if (data.identification) {
        setIdent({
          title: data.identification.title,
          maker: data.identification.maker,
          place: data.identification.place,
          year: data.identification.year,
          confidence: data.identification.confidence,
          sources: data.identification.sources ?? [],
        });
      } else {
        setError(data.error ?? "Identification failed");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Identification failed");
    } finally {
      setBusy(false);
    }
  }

  const rows: [string, string | null, number | null][] = [
    ["Maker", ident.maker, ident.maker ? 1 : null],
    ["Location", ident.place, ident.place ? 2 : null],
    ["Year", ident.year, null],
  ];

  return (
    <div>
      <div className="disp" style={{ fontSize: 34, marginBottom: 22 }}>
        {ident.title ?? reference.filename.replace(/\.[a-z0-9]+$/i, "")}
      </div>

      {rows.map(([label, value, note]) => (
        <div className="leader" key={label} style={{ marginBottom: 11 }}>
          <span className="lbl">{label}</span>
          <span className="dot" />
          <span style={{ fontSize: 11, color: value ? "var(--ink)" : "var(--mid)" }}>
            {value ?? "not established"}
            {value && note ? <sup style={{ fontSize: 8 }}>0{note}</sup> : null}
          </span>
        </div>
      ))}

      <div className="leader">
        <span className="lbl">Confidence</span>
        <span className="dot" />
        <span style={{ fontSize: 11, color: ident.confidence === "high" ? "var(--signal)" : "var(--mid)" }}>
          {ident.confidence ?? "not run"}
          {ident.sources.length ? ` · ${ident.sources.length} sources` : ""}
        </span>
      </div>

      {ident.sources.length > 0 && (
        <div style={{ marginTop: 20, paddingTop: 14, borderTop: "1px solid var(--ink)" }}>
          <div className="lbl" style={{ marginBottom: 9 }}>Sources</div>
          <div style={{ fontSize: 10, lineHeight: 1.75, color: "var(--mid)" }}>
            {ident.sources.map((s, i) => (
              <div key={i}>
                <sup style={{ fontSize: 8 }}>0{i + 1}</sup>&nbsp;
                {s.url ? <a className="ul" href={s.url} target="_blank" rel="noreferrer">{s.label}</a> : s.label}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: 14, display: "flex", gap: 8, alignItems: "center" }}>
        <button className="btn" onClick={identify} disabled={busy} style={{ padding: "6px 11px" }}>
          {busy ? "Searching…" : ident.confidence ? "Re-identify" : "Identify this"}
        </button>
        {error && <span className="fn" style={{ color: "var(--signal)", margin: 0 }}>{error}</span>}
      </div>
    </div>
  );
}

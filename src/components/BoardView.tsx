"use client";

import Link from "next/link";
import { useState } from "react";
import type { Reference } from "@/lib/types";
import { ConceptStudio } from "./ConceptStudio";

type Board = {
  id: string; name: string; client: string | null; event_date: string | null;
  style: "editorial" | "grid" | "collage"; narrative: string | null; materials: string | null;
};

const STYLES: Board["style"][] = ["editorial", "grid", "collage"];

export function BoardView({ board, items, concepts }: {
  board: Board; items: Reference[]; concepts: any[];
}) {
  const [style, setStyle] = useState<Board["style"]>(board.style ?? "editorial");
  const [tab, setTab] = useState<"board" | "concept">("board");

  const materials: string[] = (() => {
    try { return JSON.parse(board.materials ?? "[]"); } catch { return []; }
  })();

  const palette = [...new Map(
    items.flatMap((r) => r.palette).map((p) => [p.hex, p])
  ).values()].slice(0, 5);

  async function setBoardStyle(s: Board["style"]) {
    setStyle(s);
    await fetch(`/api/boards/${board.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ style: s }),
    });
  }

  return (
    <div className="shell">
      <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
        <Link href="/boards" className="nav ul">&larr; Boards</Link>
        <span className="nav" style={{ fontWeight: 700 }}>{board.name}</span>
        <div style={{ flexGrow: 1 }} />
        <span className="lbl">Style</span>
        {STYLES.map((s) => (
          <button key={s} className="brk" aria-pressed={style === s} onClick={() => setBoardStyle(s)}>
            [ {s} ]
          </button>
        ))}
        <button className="brk" aria-pressed={tab === "concept"} onClick={() => setTab(tab === "concept" ? "board" : "concept")}>
          [ Concept ]
        </button>
      </div>
      <div className="rule" />

      {tab === "concept" ? (
        <ConceptStudio board={board} items={items} concepts={concepts} />
      ) : (
        <>
          <div style={{ display: "flex", gap: 40, marginTop: 22, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 520px", minWidth: 0 }}>
              <div className="lbl" style={{ marginBottom: 10 }}>
                Direction 01,&nbsp; {board.client ?? "Unassigned"},&nbsp; {board.event_date ?? "—"}
              </div>
              <div className="disp" style={{ fontSize: style === "editorial" ? 56 : 34 }}>{board.name}</div>
              {board.narrative && (
                <p style={{ fontSize: 12, lineHeight: 1.85, maxWidth: 620, marginTop: 20 }}>{board.narrative}</p>
              )}
              <div className="fn" style={{ marginTop: 14 }}>
                Written from the {items.length} references on this board
              </div>

              {materials.length > 0 && (
                <div style={{ marginTop: 26 }}>
                  <div className="lbl" style={{ marginBottom: 10 }}>Materials</div>
                  <div style={{ fontSize: 11, lineHeight: 1.9 }}>{materials.join(" · ")}</div>
                </div>
              )}
            </div>

            {palette.length > 0 && (
              <div>
                <div className="lbl" style={{ marginBottom: 10 }}>Palette</div>
                <div style={{ display: "flex" }}>
                  {palette.map((p) => (
                    <div key={p.hex}>
                      <div style={{ width: 62, height: 40, background: p.hex }} />
                      <div className="fn" style={{ marginTop: 4 }}>{p.hex.replace("#", "").toUpperCase()}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="leader" style={{ marginTop: 26 }}>
            <span className="lbl ink">Plates 01&ndash;{String(items.length).padStart(2, "0")}</span>
            <span className="dash" />
            <span className="lbl">{items.length} references on this board</span>
          </div>

          {style === "grid" ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 24, marginTop: 22 }}>
              {items.map((r, i) => (
                <Link key={r.id} href={`/reference/${r.id}`}>
                  <div className={`t${r.mediaKey ? "" : " ph"}`} style={{ height: 208, backgroundImage: r.mediaKey ? `url(/api/media/${r.mediaKey})` : undefined }} />
                  <div className="leader" style={{ marginTop: 7 }}>
                    <span className="fn" style={{ margin: 0 }}>{String(i + 1).padStart(2, "0")}</span>
                    <span className="dot" />
                    <span className="fn" style={{ margin: 0 }}>{r.filename}</span>
                  </div>
                  {r.ident.maker && <div className="fn" style={{ marginTop: 3 }}>{r.ident.maker}</div>}
                </Link>
              ))}
            </div>
          ) : (
            <div className="masonry" style={{ marginTop: 22, columns: style === "collage" ? 3 : 4 }}>
              {items.map((r) => (
                <Link key={r.id} href={`/reference/${r.id}`} className="cell" style={{ display: "block" }}>
                  <div
                    className={`t${r.mediaKey ? "" : " ph"}`}
                    style={{
                      height: 160 + ((r.id.charCodeAt(0) % 5) * 40),
                      backgroundImage: r.mediaKey ? `url(/api/media/${r.mediaKey})` : undefined,
                    }}
                  />
                  <div className="fn">{r.filename}</div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

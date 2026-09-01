import Link from "next/link";
import { env } from "@/lib/env";
import { listReferences } from "@/lib/db";
import { Nav } from "@/components/Nav";

export const dynamic = "force-dynamic";

export default async function BoardsPage() {
  const { DB } = await env();
  const boards = await DB.prepare(
    `SELECT b.*, COUNT(bi.reference_id) AS n
       FROM boards b LEFT JOIN board_items bi ON bi.board_id = b.id
      GROUP BY b.id ORDER BY b.created_at DESC`
  ).all().then((r) => r.results as any[]).catch(() => []);

  const previews = await Promise.all(
    boards.map(async (b) => {
      const rows = await DB.prepare(
        `SELECT reference_id FROM board_items WHERE board_id = ? ORDER BY position LIMIT 5`
      ).bind(b.id).all();
      return { id: b.id, refs: await listReferences({ ids: (rows.results as any[]).map((r) => r.reference_id) }) };
    })
  );
  const byId = new Map(previews.map((p) => [p.id, p.refs]));

  return (
    <div className="shell">
      <Nav active="Boards" />

      <div className="leader" style={{ marginTop: 22 }}>
        <span className="lbl ink">{boards.length} boards</span>
        <span className="dash" />
        <span className="lbl">Lasso a group in Explore to start a new one</span>
      </div>

      {boards.length === 0 && (
        <p style={{ marginTop: 30, fontSize: 12, lineHeight: 1.9, color: "var(--mid)", maxWidth: 560 }}>
          No boards yet. Open <Link href="/explore" className="ul">Explore</Link>, drag a lasso
          around a mood you like, and the AI writes the direction that goes with it.
        </p>
      )}

      <div style={{ marginTop: 30, display: "flex", flexDirection: "column", gap: 30 }}>
        {boards.map((b) => (
          <div key={b.id}>
            <div className="leader">
              <Link href={`/boards/${b.id}`} className="disp" style={{ fontSize: 22 }}>{b.name}</Link>
              <span className="dash" />
              <span className="lbl">{b.client ? `${b.client} · ` : ""}{b.n} references</span>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              {(byId.get(b.id) ?? []).map((r) => (
                <div
                  key={r.id}
                  className={`t${r.mediaKey ? "" : " ph"}`}
                  style={{ width: 150, height: 106, backgroundImage: r.mediaKey ? `url(/api/media/${r.mediaKey})` : undefined }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

import Link from "next/link";
import { env } from "@/lib/env";
import { listReferences } from "@/lib/db";
import { Nav } from "@/components/Nav";
import { ClusterRunner } from "@/components/ClusterRunner";

export const dynamic = "force-dynamic";

export default async function ClustersPage() {
  const { DB } = await env();
  const clusters = await DB.prepare(`SELECT * FROM clusters ORDER BY size DESC`)
    .all()
    .then((r) => r.results as unknown as { id: string; name: string; summary: string; size: number }[])
    .catch(() => []);

  const previews = await Promise.all(
    clusters.map(async (c) => ({ id: c.id, refs: await listReferences({ cluster: c.id, limit: 6 }) }))
  );
  const byId = new Map(previews.map((p) => [p.id, p.refs]));

  return (
    <div className="shell">
      <Nav active="Clusters" right={<ClusterRunner hasClusters={clusters.length > 0} />} />

      <div className="leader" style={{ marginTop: 22 }}>
        <span className="lbl ink">{clusters.length} style territories</span>
        <span className="dash" />
        <span className="lbl">Grouped and named by the AI, not by folders</span>
      </div>

      {clusters.length === 0 && (
        <p style={{ marginTop: 30, fontSize: 12, lineHeight: 1.9, color: "var(--mid)", maxWidth: 560 }}>
          Nothing grouped yet. Once a few dozen references have been enriched, run the
          grouping and the library sorts itself into named territories.
        </p>
      )}

      <div style={{ marginTop: 30, display: "flex", flexDirection: "column", gap: 34 }}>
        {clusters.map((c) => (
          <div key={c.id}>
            <div className="leader">
              <Link href={`/?cluster=${c.id}`} className="disp" style={{ fontSize: 20 }}>{c.name}</Link>
              <span className="dash" />
              <span className="lbl">{c.size} references</span>
            </div>
            {c.summary && (
              <p style={{ fontSize: 11.5, lineHeight: 1.85, color: "var(--mid)", maxWidth: 720, margin: "12px 0 0" }}>
                {c.summary}
              </p>
            )}
            <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
              {(byId.get(c.id) ?? []).map((r) => (
                <Link key={r.id} href={`/reference/${r.id}`}>
                  <div
                    className={`t${r.mediaKey ? "" : " ph"}`}
                    style={{ width: 132, height: 96, backgroundImage: r.mediaKey ? `url(/api/media/${r.mediaKey})` : undefined }}
                  />
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

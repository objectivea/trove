import { Nav } from "@/components/Nav";
import { Tile } from "@/components/Tile";
import { SearchBar } from "@/components/SearchBar";
import { listReferences } from "@/lib/db";
import { searchByVibe } from "@/lib/vectors";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const query = q.trim();

  let items: Awaited<ReturnType<typeof listReferences>> = [];
  let keywordCount = 0;
  let vibeCount = 0;

  if (query) {
    const { DB } = await env();
    const kw = await DB.prepare(
      `SELECT id FROM refs_fts WHERE refs_fts MATCH ? ORDER BY rank LIMIT 60`
    ).bind(query.replace(/["']/g, "") + "*").all().catch(() => ({ results: [] as { id: string }[] }));
    const keywordIds = (kw.results as { id: string }[]).map((r) => r.id);
    keywordCount = keywordIds.length;

    let vibeIds: string[] = [];
    try {
      vibeIds = (await searchByVibe(query, 60)).map((h) => h.id);
    } catch { /* index still warming */ }
    vibeCount = vibeIds.length;

    const seen = new Set<string>();
    const ordered = [...keywordIds, ...vibeIds].filter((id) => !seen.has(id) && seen.add(id));
    items = await listReferences({ ids: ordered.slice(0, 120) });
  }

  return (
    <div className="shell">
      <Nav active="Library" right={<SearchBar initial={query} />} />

      <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginTop: 24, flexWrap: "wrap" }}>
        <span className="lbl">Query</span>
        <span className="disp" style={{ fontSize: 30 }}>&ldquo;{query || "…"}&rdquo;</span>
      </div>

      <div className="leader" style={{ marginTop: 20 }}>
        <span className="lbl ink">{items.length} matches</span>
        <span className="dash" />
        <span className="lbl">
          {keywordCount} by keyword · {vibeCount} by vibe
          {vibeCount > keywordCount ? " — most of these were never tagged with those words" : ""}
        </span>
      </div>

      {items.length === 0 && query && (
        <p style={{ marginTop: 30, fontSize: 12, color: "var(--mid)", lineHeight: 1.9, maxWidth: 560 }}>
          Nothing matched. If the library is newly imported, references need enriching before
          vibe search can reach them — run it from Import.
        </p>
      )}

      <div className="masonry" style={{ paddingTop: 26 }}>
        {items.map((r) => <Tile key={r.id} ref_={r} />)}
      </div>
    </div>
  );
}

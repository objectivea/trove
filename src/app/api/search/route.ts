import { env } from "@/lib/env";
import { listReferences } from "@/lib/db";
import { searchByVibe } from "@/lib/vectors";

/**
 * Two searches in one endpoint: exact keyword hits from FTS come back first and
 * instantly, then the embedding matches — which is what finds pictures nobody
 * ever tagged with the words you typed.
 */
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (!q) return Response.json({ items: [], keyword: 0, vibe: 0 });

  const { DB } = await env();

  const keyword = await DB.prepare(
    `SELECT id FROM refs_fts WHERE refs_fts MATCH ? ORDER BY rank LIMIT 60`
  ).bind(q.replace(/["']/g, "") + "*").all().catch(() => ({ results: [] as { id: string }[] }));

  const keywordIds = (keyword.results as { id: string }[]).map((r) => r.id);

  let vibeIds: string[] = [];
  try {
    const hits = await searchByVibe(q, 60);
    vibeIds = hits.map((h) => h.id);
  } catch {
    // vector index not ready yet — keyword results still stand
  }

  const seen = new Set<string>();
  const ordered = [...keywordIds, ...vibeIds].filter((id) => !seen.has(id) && seen.add(id)).slice(0, 120);

  return Response.json({
    items: await listReferences({ ids: ordered }),
    keyword: keywordIds.length,
    vibe: vibeIds.length,
  });
}

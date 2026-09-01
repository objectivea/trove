import { env } from "@/lib/env";
import { listReferences } from "@/lib/db";
import { writeBoardNarrative } from "@/lib/gemini";
import { newId } from "@/lib/media";

/**
 * Auto-clustering. Rather than run k-means over raw vectors on every request, we
 * group by the style vocabulary the AI already wrote — cheap, stable, and the
 * cluster names come out readable because a model names them.
 */
export async function GET() {
  const { DB } = await env();
  const rs = await DB.prepare(
    `SELECT id, name, summary, size FROM clusters ORDER BY size DESC`
  ).all();
  return Response.json({ clusters: rs.results });
}

export async function POST() {
  const { DB } = await env();
  const refs = await listReferences({ limit: 500 });
  const ready = refs.filter((r) => r.status === "ready" && r.style.length);
  if (ready.length < 6) {
    return Response.json({ error: "not enough enriched references yet", have: ready.length }, { status: 400 });
  }

  // score every pair of references by how much style vocabulary they share
  const groups: { key: string; ids: string[]; style: Set<string>; tags: Set<string>; mood: Set<string> }[] = [];
  for (const ref of ready) {
    const best = groups
      .map((g) => ({ g, overlap: ref.style.filter((s) => g.style.has(s)).length }))
      .sort((a, b) => b.overlap - a.overlap)[0];

    if (best && best.overlap >= 2) {
      best.g.ids.push(ref.id);
      ref.style.forEach((s) => best.g.style.add(s));
      ref.tags.forEach((s) => best.g.tags.add(s));
      ref.mood.forEach((s) => best.g.mood.add(s));
    } else {
      groups.push({
        key: newId(),
        ids: [ref.id],
        style: new Set(ref.style),
        tags: new Set(ref.tags),
        mood: new Set(ref.mood),
      });
    }
  }

  const keep = groups.filter((g) => g.ids.length >= 3).sort((a, b) => b.ids.length - a.ids.length).slice(0, 8);

  await DB.prepare(`DELETE FROM clusters`).run();
  const now = Date.now();

  for (const g of keep) {
    const named = await writeBoardNarrative({
      tags: [...g.tags].slice(0, 12),
      style: [...g.style].slice(0, 12),
      mood: [...g.mood].slice(0, 6),
      palette: [],
    }).catch(() => ({ title: [...g.style][0] ?? "Untitled", narrative: "", materials: [] }));

    await DB.prepare(
      `INSERT INTO clusters (id, name, summary, size, updated_at) VALUES (?, ?, ?, ?, ?)`
    ).bind(g.key, named.title, named.narrative, g.ids.length, now).run();

    // D1 has a bound-parameter ceiling, so update cluster membership in chunks
    for (let i = 0; i < g.ids.length; i += 50) {
      const slice = g.ids.slice(i, i + 50);
      await DB.prepare(
        `UPDATE references_ SET cluster_id = ? WHERE id IN (${slice.map(() => "?").join(",")})`
      ).bind(g.key, ...slice).run();
    }
  }

  return Response.json({ clusters: keep.length, assigned: keep.reduce((n, g) => n + g.ids.length, 0) });
}

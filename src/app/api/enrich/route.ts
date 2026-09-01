import { enrichReference } from "@/lib/enrich";
import { env } from "@/lib/env";

export const maxDuration = 120;

/** Re-run enrichment for one id, or drain the queue in small batches. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as { id?: string; batch?: number };

  if (body.id) return Response.json(await enrichReference(body.id));

  const { DB } = await env();
  const rs = await DB.prepare(
    `SELECT id FROM references_ WHERE status IN ('queued','failed') LIMIT ?`
  ).bind(Math.min(body.batch ?? 5, 20)).all();

  const results = [];
  for (const row of rs.results as { id: string }[]) {
    results.push({ id: row.id, ...(await enrichReference(row.id)) });
  }
  return Response.json({ processed: results.length, results });
}

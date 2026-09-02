import { env } from "@/lib/env";
import { putMedia } from "@/lib/media";
import { findImage } from "@/lib/instagram";

export const maxDuration = 300;

/**
 * Recovers the picture for references imported as `held`.
 *
 * Deliberately small and resumable: it takes a batch, reports what is left, and
 * expects to be called again. Instagram throttles aggressively, so a whole
 * library is recovered over many polite passes rather than one long run — and a
 * failure only ever costs the batch it happened in.
 */
export async function POST(req: Request) {
  const { DB } = await env();
  const body = (await req.json().catch(() => ({}))) as {
    limit?: number;
    delayMs?: number;
    retryFailed?: boolean;
  };

  const limit = Math.min(Math.max(body.limit ?? 10, 1), 50);
  const delay = Math.min(Math.max(body.delayMs ?? 900, 0), 10_000);

  // 'held' is never-tried; 'held_failed' has been tried and missed
  const states = body.retryFailed ? ["held", "held_failed"] : ["held"];
  const marks = states.map(() => "?").join(",");

  const rows = await DB.prepare(
    `SELECT id, source_url FROM references_
      WHERE media_key IS NULL AND status IN (${marks}) AND source_url IS NOT NULL
      ORDER BY saved_at DESC LIMIT ?`
  ).bind(...states, limit).all();

  const batch = rows.results as unknown as { id: string; source_url: string }[];
  let recovered = 0;
  const failures: { url: string; reason: string }[] = [];

  for (const [i, row] of batch.entries()) {
    if (i > 0 && delay) await new Promise((r) => setTimeout(r, delay + Math.random() * delay * 0.4));

    const found = await findImage(row.source_url);
    if (!found.ok || !found.thumbnailUrl) {
      failures.push({ url: row.source_url, reason: found.reason ?? "not found" });
      await DB.prepare(`UPDATE references_ SET status = 'held_failed' WHERE id = ?`).bind(row.id).run();
      continue;
    }

    try {
      // the CDN url is signed and short-lived, so it is downloaded now, not stored
      const img = await fetch(found.thumbnailUrl, { headers: { referer: "https://www.instagram.com/" } });
      if (!img.ok) throw new Error(`cdn ${img.status}`);

      const type = img.headers.get("content-type") ?? "image/jpeg";
      const bytes = await img.arrayBuffer();
      if (bytes.byteLength < 1024) throw new Error("suspiciously small image");

      const key = `ref/${row.id}.jpg`;
      await putMedia(key, bytes, type);

      // 'queued' hands it to the enrichment pipeline for tags, palette, vectors
      await DB.prepare(
        `UPDATE references_ SET media_key = ?, bytes = ?, status = 'queued' WHERE id = ?`
      ).bind(key, bytes.byteLength, row.id).run();
      recovered++;
    } catch (e) {
      failures.push({ url: row.source_url, reason: e instanceof Error ? e.message : "download failed" });
      await DB.prepare(`UPDATE references_ SET status = 'held_failed' WHERE id = ?`).bind(row.id).run();
    }
  }

  const left = await DB.prepare(
    `SELECT
       SUM(CASE WHEN status = 'held' THEN 1 ELSE 0 END) AS untried,
       SUM(CASE WHEN status = 'held_failed' THEN 1 ELSE 0 END) AS failed,
       SUM(CASE WHEN media_key IS NOT NULL THEN 1 ELSE 0 END) AS have
     FROM references_`
  ).first<{ untried: number; failed: number; have: number }>();

  return Response.json({
    attempted: batch.length,
    recovered,
    failed: failures.length,
    remaining: left?.untried ?? 0,
    previouslyFailed: left?.failed ?? 0,
    withImages: left?.have ?? 0,
    failures: failures.slice(0, 5),
  });
}

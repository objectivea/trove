import { env } from "@/lib/env";
import { newId, putMedia } from "@/lib/media";
import { fetchOEmbed } from "@/lib/instagram";

export const maxDuration = 300;

type Incoming = {
  url: string;
  collection: string | null;
  savedAt: number | null;
};

/**
 * Bulk import from Instagram's official "Download your information" export.
 * The browser unzips and parses the JSON (the ZIP never leaves the machine);
 * this route takes the resulting list, recovers what it can via oEmbed, and
 * preserves the collection names as Trove collections.
 */
export async function POST(req: Request) {
  const { DB } = await env();
  const body = (await req.json()) as { posts: Incoming[]; importId?: string };
  const posts = (body.posts ?? []).slice(0, 200); // chunked by the client
  if (!posts.length) return Response.json({ error: "no posts" }, { status: 400 });

  let recovered = 0;
  let held = 0;
  const collectionIds = new Map<string, string>();

  for (const post of posts) {
    const existing = await DB.prepare(`SELECT id FROM references_ WHERE source_url = ?`)
      .bind(post.url).first<{ id: string }>();
    if (existing) continue;

    const meta = await fetchOEmbed(post.url);
    const id = newId();
    let mediaKey: string | null = null;

    if (meta.ok && meta.thumbnailUrl) {
      try {
        const img = await fetch(meta.thumbnailUrl);
        if (img.ok) {
          const type = img.headers.get("content-type") ?? "image/jpeg";
          mediaKey = `ref/${id}.jpg`;
          await putMedia(mediaKey, await img.arrayBuffer(), type);
          recovered++;
        }
      } catch { /* leave mediaKey null — it becomes a held record */ }
    }
    if (!mediaKey) held++;

    const shortcode = post.url.split("/").filter(Boolean).pop() ?? id;

    await DB.prepare(
      `INSERT INTO references_
         (id, filename, media_key, source, source_url, author, caption, status, saved_at, created_at)
       VALUES (?, ?, ?, 'instagram', ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      `IG_${shortcode}.jpg`,
      mediaKey,
      post.url,
      meta.author ?? null,
      meta.caption ?? null,
      mediaKey ? "queued" : "failed",
      post.savedAt,
      Date.now()
    ).run();

    if (post.collection) {
      let cid = collectionIds.get(post.collection);
      if (!cid) {
        const found = await DB.prepare(`SELECT id FROM collections WHERE name = ?`)
          .bind(post.collection).first<{ id: string }>();
        cid = found?.id ?? newId();
        if (!found) {
          await DB.prepare(
            `INSERT INTO collections (id, name, source, created_at) VALUES (?, ?, 'instagram', ?)`
          ).bind(cid, post.collection, Date.now()).run();
        }
        collectionIds.set(post.collection, cid);
      }
      await DB.prepare(
        `INSERT OR IGNORE INTO reference_collections (reference_id, collection_id) VALUES (?, ?)`
      ).bind(id, cid).run();
    }
  }

  return Response.json({
    imported: posts.length,
    recovered,
    held,
    note: held ? `${held} posts could not be fetched — private or deleted. Kept as records with their collection.` : undefined,
  });
}

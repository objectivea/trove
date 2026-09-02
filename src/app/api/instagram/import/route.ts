import { env } from "@/lib/env";
import { newId, putMedia } from "@/lib/media";
import { fetchOEmbed } from "@/lib/instagram";
import type { SavedPost } from "@/lib/instagram-export";

export const maxDuration = 300;

/**
 * Bulk import from Instagram's official data export.
 *
 * The export already carries the owner handle, the caption and the hashtags for
 * essentially every save, so a reference is worth keeping even when its picture
 * cannot be recovered: it stays searchable, it keeps its collection, and Identify
 * can still work from the caption. oEmbed is therefore best-effort and only ever
 * supplies the thumbnail.
 */
export async function POST(req: Request) {
  const { DB } = await env();
  const body = (await req.json()) as { posts: SavedPost[]; fetchImages?: boolean };
  const posts = (body.posts ?? []).slice(0, 100);
  if (!posts.length) return Response.json({ error: "no posts" }, { status: 400 });

  const fetchImages = body.fetchImages !== false;
  let recovered = 0, held = 0, skipped = 0;
  const collectionIds = new Map<string, string>();

  async function collectionId(name: string) {
    const cached = collectionIds.get(name);
    if (cached) return cached;
    const found = await DB.prepare(`SELECT id FROM collections WHERE name = ?`)
      .bind(name).first<{ id: string }>();
    const id = found?.id ?? newId();
    if (!found) {
      await DB.prepare(
        `INSERT INTO collections (id, name, source, created_at) VALUES (?, ?, 'instagram', ?)`
      ).bind(id, name, Date.now()).run();
    }
    collectionIds.set(name, id);
    return id;
  }

  for (const post of posts) {
    const existing = await DB.prepare(`SELECT id FROM references_ WHERE source_url = ?`)
      .bind(post.url).first<{ id: string }>();

    if (existing) {
      // already imported — still make sure its collections are attached
      for (const name of post.collections ?? []) {
        await DB.prepare(
          `INSERT OR IGNORE INTO reference_collections (reference_id, collection_id) VALUES (?, ?)`
        ).bind(existing.id, await collectionId(name)).run();
      }
      skipped++;
      continue;
    }

    const id = newId();
    let mediaKey: string | null = null;

    if (fetchImages) {
      const meta = await fetchOEmbed(post.url);
      if (meta.ok && meta.thumbnailUrl) {
        try {
          const img = await fetch(meta.thumbnailUrl);
          if (img.ok) {
            mediaKey = `ref/${id}.jpg`;
            await putMedia(mediaKey, await img.arrayBuffer(), img.headers.get("content-type") ?? "image/jpeg");
            recovered++;
          }
        } catch { /* falls through to a held record */ }
      }
    }
    if (!mediaKey) held++;

    const shortcode = post.url.split("/").filter(Boolean).pop() ?? id;

    await DB.prepare(
      `INSERT INTO references_
         (id, filename, media_key, source, source_url, author, caption, tags,
          status, saved_at, created_at)
       VALUES (?, ?, ?, 'instagram', ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      `IG_${shortcode}.jpg`,
      mediaKey,
      post.url,
      post.author ?? null,
      post.caption ?? null,
      JSON.stringify(post.hashtags ?? []),
      mediaKey ? "queued" : "held",
      post.savedAt ?? null,
      Date.now()
    ).run();

    // searchable from the moment it lands, before any AI has looked at it
    await DB.prepare(
      `INSERT INTO refs_fts (id, filename, tags, style, mood, caption, ident, ocr)
       VALUES (?, ?, ?, '', '', ?, ?, '')`
    ).bind(
      id,
      `IG_${shortcode}.jpg`,
      (post.hashtags ?? []).join(" "),
      post.caption ?? "",
      [post.author, post.authorName].filter(Boolean).join(" ")
    ).run().catch(() => {});

    for (const name of post.collections ?? []) {
      await DB.prepare(
        `INSERT OR IGNORE INTO reference_collections (reference_id, collection_id) VALUES (?, ?)`
      ).bind(id, await collectionId(name)).run();
    }
  }

  return Response.json({
    imported: posts.length - skipped,
    skipped,
    recovered,
    held,
    note: held
      ? `${held} posts kept as records — the picture could not be fetched (private, deleted, or rate-limited). Caption, account and collection are all still searchable.`
      : undefined,
  });
}

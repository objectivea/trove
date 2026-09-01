import { env } from "./env";
import { getReference, reindexFts, rowToReference } from "./db";
import { enrichImage, identifyImage } from "./gemini";
import { embedImage, embedText, upsertVectors } from "./vectors";
import { getMediaBytes, toBase64 } from "./media";

/**
 * The heavy lifting the product promises on upload: describe the image, embed it
 * for similarity, and mirror the words into FTS. Identification is separate
 * because it costs a web search and is worth running on demand.
 */
export async function enrichReference(id: string): Promise<{ ok: boolean; error?: string }> {
  const { DB } = await env();
  const ref = await getReference(id);
  if (!ref) return { ok: false, error: "not found" };
  if (!ref.mediaKey) return { ok: false, error: "no media" };

  await DB.prepare(`UPDATE references_ SET status = 'enriching' WHERE id = ?`).bind(id).run();

  try {
    const media = await getMediaBytes(ref.mediaKey);
    if (!media) throw new Error("media missing from R2");

    const described = await enrichImage(toBase64(media.bytes), media.contentType);

    // one sentence standing in for the image in text space — this is what vibe search matches
    const descriptor = [
      described.tags.join(", "),
      described.style.join(", "),
      described.mood.join(", "),
      described.format,
      ref.caption ?? "",
      described.ocr,
    ].filter(Boolean).join(". ");

    const [imageVec, textVec] = await Promise.all([
      embedImage(media.bytes).catch(() => [] as number[]),
      embedText(descriptor).catch(() => [] as number[]),
    ]);
    await upsertVectors(id, { image: imageVec, text: textVec });

    await DB.prepare(
      `UPDATE references_
          SET tags = ?, style = ?, mood = ?, format = ?, ocr = ?, status = 'ready'
        WHERE id = ?`
    ).bind(
      JSON.stringify(described.tags),
      JSON.stringify(described.style),
      JSON.stringify(described.mood),
      described.format,
      described.ocr,
      id
    ).run();

    const updated = await getReference(id);
    if (updated) await reindexFts(updated);
    return { ok: true };
  } catch (e) {
    await DB.prepare(`UPDATE references_ SET status = 'failed' WHERE id = ?`).bind(id).run();
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Layers 2 and 3 of Identify — run when the user asks, or in bulk overnight. */
export async function identifyReference(id: string) {
  const { DB } = await env();
  const ref = await getReference(id);
  if (!ref?.mediaKey) return { ok: false, error: "no media" };

  const media = await getMediaBytes(ref.mediaKey);
  if (!media) return { ok: false, error: "media missing" };

  const out = await identifyImage(toBase64(media.bytes), media.contentType, {
    caption: ref.caption,
    author: ref.author,
  });

  await DB.prepare(
    `UPDATE references_
        SET ident_title = ?, ident_maker = ?, ident_place = ?, ident_year = ?,
            ident_confidence = ?, ident_sources = ?
      WHERE id = ?`
  ).bind(
    out.title, out.maker, out.place, out.year,
    out.confidence, JSON.stringify(out.sources), id
  ).run();

  const updated = await getReference(id);
  if (updated) await reindexFts(updated);
  return { ok: true, identification: out };
}

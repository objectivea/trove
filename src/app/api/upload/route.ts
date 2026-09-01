import { env } from "@/lib/env";
import { newId, putMedia } from "@/lib/media";
import { enrichReference } from "@/lib/enrich";

export const maxDuration = 60;

/**
 * Direct upload. The browser has already pulled the palette out of the bitmap
 * (free, instant), so it rides along with the file and we never pay an API call
 * for colour.
 */
export async function POST(req: Request) {
  const { DB } = await env();
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "no file" }, { status: 400 });
  }

  const palette = String(form.get("palette") ?? "[]");
  const width = Number(form.get("width") ?? 0) || null;
  const height = Number(form.get("height") ?? 0) || null;

  const id = newId();
  const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().slice(0, 5);
  const key = `ref/${id}.${ext}`;

  await putMedia(key, await file.arrayBuffer(), file.type || "image/jpeg");

  await DB.prepare(
    `INSERT INTO references_
       (id, filename, media_key, width, height, bytes, source, palette, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'upload', ?, 'queued', ?)`
  ).bind(id, file.name, key, width, height, file.size, palette, Date.now()).run();

  // enrich inline so the row is useful immediately; the UI polls for status anyway
  const result = await enrichReference(id);

  return Response.json({ id, key, enriched: result.ok, error: result.error });
}

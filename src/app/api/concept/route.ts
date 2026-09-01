import { env } from "@/lib/env";
import { listReferences } from "@/lib/db";
import { generateConcept } from "@/lib/gemini";
import { getMediaBytes, newId, putMedia, toBase64, fromBase64 } from "@/lib/media";

export const maxDuration = 300;

const SLOTS = ["room dressing", "table setting", "invitation", "signage"];

/**
 * Concept Studio. Gemini takes the board's actual reference images as input, so
 * what comes back is the project in THIS board's visual language rather than a
 * generic reading of the brief.
 */
export async function POST(req: Request) {
  const { DB } = await env();
  const body = (await req.json()) as { boardId: string; brief: string; slots?: string[] };
  if (!body.boardId || !body.brief) {
    return Response.json({ error: "boardId and brief required" }, { status: 400 });
  }

  const board = await DB.prepare(`SELECT * FROM boards WHERE id = ?`).bind(body.boardId).first<any>();
  if (!board) return Response.json({ error: "board not found" }, { status: 404 });

  const rows = await DB.prepare(
    `SELECT reference_id FROM board_items WHERE board_id = ? ORDER BY position LIMIT 4`
  ).bind(body.boardId).all();

  const refs = await listReferences({ ids: (rows.results as { reference_id: string }[]).map((r) => r.reference_id) });

  const references: { base64: string; mime: string }[] = [];
  for (const r of refs) {
    if (!r.mediaKey) continue;
    const m = await getMediaBytes(r.mediaKey);
    if (m) references.push({ base64: toBase64(m.bytes), mime: m.contentType });
  }

  const palette = [...new Set(refs.flatMap((r) => r.palette.map((p) => p.name)))].slice(0, 6);
  const slots = (body.slots?.length ? body.slots : SLOTS).slice(0, 4);
  const made: unknown[] = [];

  for (const [i, slot] of slots.entries()) {
    const out = await generateConcept({
      slot,
      brief: body.brief,
      narrative: board.narrative ?? "",
      palette,
      references,
    }).catch(() => null);

    if (!out) continue;

    const id = newId();
    const filename = `CONCEPT_0${i + 1}_${slot.replace(/\s+/g, "")}.png`;
    const key = `concept/${id}.png`;
    await putMedia(key, fromBase64(out.base64), out.mime);

    await DB.prepare(
      `INSERT INTO concepts (id, board_id, slot, filename, media_key, prompt, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, body.boardId, slot, filename, key, out.prompt, Date.now()).run();

    made.push({ id, slot, filename, mediaKey: key });
  }

  return Response.json({ concepts: made, generated: made.length, requested: slots.length });
}

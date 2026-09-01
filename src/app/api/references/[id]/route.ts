import { getReference } from "@/lib/db";
import { env } from "@/lib/env";
import { deleteVectors } from "@/lib/vectors";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const ref = await getReference(id);
  return ref ? Response.json(ref) : Response.json({ error: "not found" }, { status: 404 });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { DB, MEDIA } = await env();
  const ref = await getReference(id);
  if (ref?.mediaKey) await MEDIA.delete(ref.mediaKey);
  await deleteVectors(id);
  await DB.batch([
    DB.prepare(`DELETE FROM references_ WHERE id = ?`).bind(id),
    DB.prepare(`DELETE FROM refs_fts WHERE id = ?`).bind(id),
    DB.prepare(`DELETE FROM reference_collections WHERE reference_id = ?`).bind(id),
    DB.prepare(`DELETE FROM board_items WHERE reference_id = ?`).bind(id),
  ]);
  return Response.json({ ok: true });
}

import { env } from "@/lib/env";
import { listReferences } from "@/lib/db";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { DB } = await env();

  const board = await DB.prepare(`SELECT * FROM boards WHERE id = ?`).bind(id).first();
  if (!board) return Response.json({ error: "not found" }, { status: 404 });

  const rows = await DB.prepare(
    `SELECT reference_id FROM board_items WHERE board_id = ? ORDER BY position`
  ).bind(id).all();

  const concepts = await DB.prepare(
    `SELECT * FROM concepts WHERE board_id = ? ORDER BY created_at`
  ).bind(id).all();

  return Response.json({
    board,
    items: await listReferences({ ids: (rows.results as { reference_id: string }[]).map((r) => r.reference_id) }),
    concepts: concepts.results,
  });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { DB } = await env();
  const body = (await req.json()) as { style?: string; name?: string; narrative?: string };

  if (body.style) await DB.prepare(`UPDATE boards SET style = ? WHERE id = ?`).bind(body.style, id).run();
  if (body.name) await DB.prepare(`UPDATE boards SET name = ? WHERE id = ?`).bind(body.name, id).run();
  if (body.narrative) await DB.prepare(`UPDATE boards SET narrative = ? WHERE id = ?`).bind(body.narrative, id).run();

  return Response.json({ ok: true });
}

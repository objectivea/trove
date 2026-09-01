import Link from "next/link";
import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { listReferences } from "@/lib/db";
import { BoardView } from "@/components/BoardView";

export const dynamic = "force-dynamic";

export default async function BoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { DB } = await env();

  const board = await DB.prepare(`SELECT * FROM boards WHERE id = ?`).bind(id).first<any>();
  if (!board) notFound();

  const rows = await DB.prepare(
    `SELECT reference_id FROM board_items WHERE board_id = ? ORDER BY position`
  ).bind(id).all();

  const concepts = await DB.prepare(
    `SELECT * FROM concepts WHERE board_id = ? ORDER BY created_at`
  ).bind(id).all().then((r) => r.results as any[]).catch(() => []);

  const items = await listReferences({ ids: (rows.results as any[]).map((r) => r.reference_id) });

  return <BoardView board={board} items={items} concepts={concepts} />;
}

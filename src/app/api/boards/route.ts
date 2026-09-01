import { env } from "@/lib/env";
import { newId } from "@/lib/media";
import { listReferences } from "@/lib/db";
import { writeBoardNarrative } from "@/lib/gemini";

export async function GET() {
  const { DB } = await env();
  const rs = await DB.prepare(
    `SELECT b.*, COUNT(bi.reference_id) AS n
       FROM boards b LEFT JOIN board_items bi ON bi.board_id = b.id
      GROUP BY b.id ORDER BY b.created_at DESC`
  ).all();
  return Response.json({ boards: rs.results });
}

/** Create a board from a set of references and have the AI write its direction. */
export async function POST(req: Request) {
  const { DB } = await env();
  const body = (await req.json()) as {
    name?: string; client?: string; eventDate?: string; referenceIds: string[];
  };
  const ids = body.referenceIds ?? [];
  if (!ids.length) return Response.json({ error: "referenceIds required" }, { status: 400 });

  const refs = await listReferences({ ids });
  const id = newId();

  const dna = await writeBoardNarrative({
    tags: dedupe(refs.flatMap((r) => r.tags)),
    style: dedupe(refs.flatMap((r) => r.style)),
    mood: dedupe(refs.flatMap((r) => r.mood)),
    palette: dedupe(refs.flatMap((r) => r.palette.map((p) => p.name))).slice(0, 6),
    client: body.client,
  }).catch(() => ({ title: body.name ?? "Untitled direction", narrative: "", materials: [] }));

  await DB.prepare(
    `INSERT INTO boards (id, name, client, event_date, style, narrative, materials, created_at)
     VALUES (?, ?, ?, ?, 'editorial', ?, ?, ?)`
  ).bind(
    id, body.name ?? dna.title, body.client ?? null, body.eventDate ?? null,
    dna.narrative, JSON.stringify(dna.materials), Date.now()
  ).run();

  await DB.batch(
    ids.map((refId, i) =>
      DB.prepare(`INSERT OR IGNORE INTO board_items (board_id, reference_id, position) VALUES (?, ?, ?)`)
        .bind(id, refId, i)
    )
  );

  return Response.json({ id, name: body.name ?? dna.title, narrative: dna.narrative });
}

const dedupe = (xs: string[]) => [...new Set(xs)].slice(0, 20);

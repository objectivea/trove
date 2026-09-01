import { env } from "./env";
import type { Reference, Swatch, Source } from "./types";

const j = <T,>(raw: unknown, fallback: T): T => {
  if (typeof raw !== "string" || raw.length === 0) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

/** Map a D1 row onto the shape the UI actually wants. */
export function rowToReference(r: Record<string, unknown>): Reference {
  return {
    id: String(r.id),
    filename: String(r.filename),
    mediaKey: (r.media_key as string) ?? null,
    width: (r.width as number) ?? null,
    height: (r.height as number) ?? null,
    source: (r.source as Reference["source"]) ?? "upload",
    sourceUrl: (r.source_url as string) ?? null,
    author: (r.author as string) ?? null,
    caption: (r.caption as string) ?? null,
    status: (r.status as Reference["status"]) ?? "queued",
    tags: j<string[]>(r.tags, []),
    style: j<string[]>(r.style, []),
    mood: j<string[]>(r.mood, []),
    format: (r.format as string) ?? null,
    palette: j<Swatch[]>(r.palette, []),
    ocr: (r.ocr as string) ?? null,
    ident: {
      title: (r.ident_title as string) ?? null,
      maker: (r.ident_maker as string) ?? null,
      place: (r.ident_place as string) ?? null,
      year: (r.ident_year as string) ?? null,
      confidence: (r.ident_confidence as Reference["ident"]["confidence"]) ?? null,
      sources: j<Source[]>(r.ident_sources, []),
    },
    clusterId: (r.cluster_id as string) ?? null,
    savedAt: (r.saved_at as number) ?? null,
    createdAt: Number(r.created_at ?? 0),
  };
}

export async function listReferences(opts: {
  limit?: number;
  offset?: number;
  collection?: string | null;
  cluster?: string | null;
  ids?: string[];
} = {}): Promise<Reference[]> {
  const { DB } = await env();
  const limit = Math.min(opts.limit ?? 120, 500);
  const offset = opts.offset ?? 0;

  if (opts.ids?.length) {
    const marks = opts.ids.map(() => "?").join(",");
    const rs = await DB.prepare(
      `SELECT * FROM references_ WHERE id IN (${marks})`
    ).bind(...opts.ids).all();
    // preserve the caller's ordering (vector search returns by score)
    const byId = new Map(rs.results.map((r) => [String((r as any).id), r]));
    return opts.ids
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((r) => rowToReference(r as Record<string, unknown>));
  }

  if (opts.collection) {
    const rs = await DB.prepare(
      `SELECT r.* FROM references_ r
         JOIN reference_collections rc ON rc.reference_id = r.id
        WHERE rc.collection_id = ?
        ORDER BY r.created_at DESC LIMIT ? OFFSET ?`
    ).bind(opts.collection, limit, offset).all();
    return rs.results.map((r) => rowToReference(r as Record<string, unknown>));
  }

  if (opts.cluster) {
    const rs = await DB.prepare(
      `SELECT * FROM references_ WHERE cluster_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).bind(opts.cluster, limit, offset).all();
    return rs.results.map((r) => rowToReference(r as Record<string, unknown>));
  }

  const rs = await DB.prepare(
    `SELECT * FROM references_ ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).bind(limit, offset).all();
  return rs.results.map((r) => rowToReference(r as Record<string, unknown>));
}

export async function getReference(id: string): Promise<Reference | null> {
  const { DB } = await env();
  const row = await DB.prepare(`SELECT * FROM references_ WHERE id = ?`).bind(id).first();
  return row ? rowToReference(row as Record<string, unknown>) : null;
}

export async function countReferences(): Promise<number> {
  const { DB } = await env();
  const row = await DB.prepare(`SELECT COUNT(*) AS n FROM references_`).first<{ n: number }>();
  return row?.n ?? 0;
}

export async function listCollections() {
  const { DB } = await env();
  const rs = await DB.prepare(
    `SELECT c.id, c.name, c.source, COUNT(rc.reference_id) AS n
       FROM collections c
       LEFT JOIN reference_collections rc ON rc.collection_id = c.id
      GROUP BY c.id ORDER BY n DESC`
  ).all();
  return rs.results as unknown as { id: string; name: string; source: string; n: number }[];
}

/** Keep the FTS mirror in step with a reference row. */
export async function reindexFts(ref: Reference) {
  const { DB } = await env();
  const ident = [ref.ident.title, ref.ident.maker, ref.ident.place, ref.ident.year]
    .filter(Boolean).join(" ");
  await DB.batch([
    DB.prepare(`DELETE FROM refs_fts WHERE id = ?`).bind(ref.id),
    DB.prepare(
      `INSERT INTO refs_fts (id, filename, tags, style, mood, caption, ident, ocr)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      ref.id,
      ref.filename,
      ref.tags.join(" "),
      ref.style.join(" "),
      ref.mood.join(" "),
      ref.caption ?? "",
      ident,
      ref.ocr ?? ""
    ),
  ]);
}

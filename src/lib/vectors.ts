import { env } from "./env";

/**
 * Similarity runs on CLIP embeddings from Workers AI: images and text land in the
 * same vector space, which is what lets "dusty desert tones, 70s type" match
 * pictures nobody ever tagged with those words.
 */
const IMAGE_MODEL = "@cf/openai/clip-vit-base-patch32";
const TEXT_MODEL = "@cf/baai/bge-base-en-v1.5";

/** CLIP image embedding. Bytes in, unit-normalised vector out. */
export async function embedImage(bytes: Uint8Array): Promise<number[]> {
  const { AI } = await env();
  const res: any = await (AI as any).run(IMAGE_MODEL, { image: Array.from(bytes) });
  const v: number[] = res?.data?.[0] ?? [];
  return normalise(v);
}

/**
 * Text embedding for vibe search. CLIP's text tower and BGE do not share a space,
 * so we embed the AI-written description of each image with the SAME text model
 * and compare text-to-text — reliable, and it costs nothing extra because the
 * description already exists.
 */
export async function embedText(text: string): Promise<number[]> {
  const { AI } = await env();
  const res: any = await (AI as any).run(TEXT_MODEL, { text: [text] });
  const v: number[] = res?.data?.[0] ?? [];
  return normalise(v);
}

function normalise(v: number[]): number[] {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / n);
}

/** One reference produces two vectors, namespaced so they never collide. */
export async function upsertVectors(id: string, opts: { image?: number[]; text?: number[] }) {
  const { VECTORS } = await env();
  const rows: VectorizeVector[] = [];
  if (opts.image?.length) rows.push({ id: `img:${id}`, values: opts.image, namespace: "image", metadata: { ref: id } });
  if (opts.text?.length) rows.push({ id: `txt:${id}`, values: opts.text, namespace: "text", metadata: { ref: id } });
  if (rows.length) await VECTORS.upsert(rows);
}

export async function deleteVectors(id: string) {
  const { VECTORS } = await env();
  await VECTORS.deleteByIds([`img:${id}`, `txt:${id}`]);
}

export type Hit = { id: string; score: number };

async function query(vector: number[], namespace: "image" | "text", topK: number, exclude?: string): Promise<Hit[]> {
  const { VECTORS } = await env();
  const res = await VECTORS.query(vector, { topK: topK + 1, namespace, returnMetadata: "indexed" });
  return (res.matches ?? [])
    .map((m) => ({ id: String((m.metadata as any)?.ref ?? m.id.split(":")[1] ?? ""), score: m.score }))
    .filter((h) => h.id && h.id !== exclude)
    .slice(0, topK);
}

/** "More like this" — visual neighbours of one reference. */
export async function similarTo(id: string, vector: number[], topK = 24): Promise<Hit[]> {
  return query(vector, "image", topK, id);
}

/** Free-text vibe search against the written descriptions. */
export async function searchByVibe(text: string, topK = 60): Promise<Hit[]> {
  return query(await embedText(text), "text", topK);
}

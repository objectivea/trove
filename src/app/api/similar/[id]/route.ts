import { getReference, listReferences } from "@/lib/db";
import { getMediaBytes } from "@/lib/media";
import { embedImage, similarTo } from "@/lib/vectors";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const ref = await getReference(id);
  if (!ref?.mediaKey) return Response.json({ items: [] });

  const media = await getMediaBytes(ref.mediaKey);
  if (!media) return Response.json({ items: [] });

  const hits = await similarTo(id, await embedImage(media.bytes), 18);
  return Response.json({ items: await listReferences({ ids: hits.map((h) => h.id) }), scores: hits });
}

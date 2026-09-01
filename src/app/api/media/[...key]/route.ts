import { getMediaBytes } from "@/lib/media";

export async function GET(_req: Request, ctx: { params: Promise<{ key: string[] }> }) {
  const { key } = await ctx.params;
  const obj = await getMediaBytes(key.join("/"));
  if (!obj) return new Response("Not found", { status: 404 });
  return new Response(obj.bytes as unknown as BodyInit, {
    headers: {
      "content-type": obj.contentType,
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}

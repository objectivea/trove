import { listReferences, countReferences, listCollections } from "@/lib/db";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const [items, total, collections] = await Promise.all([
    listReferences({
      limit: Number(url.searchParams.get("limit") ?? 120),
      offset: Number(url.searchParams.get("offset") ?? 0),
      collection: url.searchParams.get("collection"),
      cluster: url.searchParams.get("cluster"),
    }),
    countReferences(),
    listCollections(),
  ]);
  return Response.json({ items, total, collections });
}

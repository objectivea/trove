import { identifyReference } from "@/lib/enrich";

export const maxDuration = 120;

export async function POST(req: Request) {
  const { id } = (await req.json()) as { id: string };
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  return Response.json(await identifyReference(id));
}

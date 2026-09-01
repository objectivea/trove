import { fetchOEmbed } from "@/lib/instagram";

export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get("url");
  if (!url) return Response.json({ error: "url required" }, { status: 400 });
  return Response.json(await fetchOEmbed(url));
}

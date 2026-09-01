export type OEmbed = {
  ok: boolean;
  thumbnailUrl?: string;
  author?: string;
  caption?: string;
  reason?: string;
};

/**
 * Instagram's oEmbed endpoint has been tokenless for public posts since June 2026,
 * so a saved post URL gives us a thumbnail, the author and the caption with no
 * Meta app review. Private-account posts simply do not resolve — those are kept
 * as records rather than pretending they imported.
 */
export async function fetchOEmbed(postUrl: string): Promise<OEmbed> {
  const endpoint = `https://graph.facebook.com/v20.0/instagram_oembed?url=${encodeURIComponent(postUrl)}&omitscript=true`;
  try {
    const res = await fetch(endpoint, { headers: { "user-agent": "trove/0.1" } });
    if (!res.ok) return { ok: false, reason: `oembed ${res.status}` };
    const data = (await res.json()) as any;
    return {
      ok: Boolean(data?.thumbnail_url),
      thumbnailUrl: data?.thumbnail_url,
      author: data?.author_name,
      caption: data?.title,
    };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "fetch failed" };
  }
}

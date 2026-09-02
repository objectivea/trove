export type OEmbed = {
  ok: boolean;
  thumbnailUrl?: string;
  author?: string;
  caption?: string;
  width?: number;
  reason?: string;
};

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/**
 * Route 1 — the documented oEmbed endpoint. Tokenless for public posts since
 * June 2026, so no Meta app review. Returns a ~640px thumbnail on a signed CDN
 * url that expires quickly, so the caller must download it immediately rather
 * than storing the link.
 */
export async function fetchOEmbed(postUrl: string): Promise<OEmbed> {
  const endpoint = `https://graph.facebook.com/v20.0/instagram_oembed?url=${encodeURIComponent(postUrl)}&omitscript=true`;
  try {
    const res = await fetch(endpoint, { headers: { "user-agent": UA } });
    if (!res.ok) return { ok: false, reason: `oembed ${res.status}` };
    const data = (await res.json()) as any;
    return {
      ok: Boolean(data?.thumbnail_url),
      thumbnailUrl: data?.thumbnail_url,
      author: data?.author_name,
      caption: data?.title,
      width: data?.thumbnail_width,
    };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "fetch failed" };
  }
}

/**
 * Route 2 — the public embed page, used when oEmbed declines or is throttled.
 * Instagram serves this for any public post without authentication, and it
 * usually carries a larger image than the oEmbed thumbnail. Markup changes from
 * time to time, so several shapes are tried before giving up.
 */
export async function fetchEmbedImage(postUrl: string): Promise<OEmbed> {
  const code = postUrl.split("/").filter(Boolean).pop();
  if (!code) return { ok: false, reason: "no shortcode" };

  try {
    const res = await fetch(`https://www.instagram.com/p/${code}/embed/captioned/`, {
      headers: { "user-agent": UA, "accept-language": "en-GB,en;q=0.9" },
    });
    if (!res.ok) return { ok: false, reason: `embed ${res.status}` };
    const html = await res.text();

    const patterns = [
      /"display_url":"([^"]+)"/,
      /class="EmbeddedMediaImage"[^>]*src="([^"]+)"/,
      /<img[^>]+class="[^"]*EmbeddedMediaImage[^"]*"[^>]+src="([^"]+)"/,
      /property="og:image"\s+content="([^"]+)"/,
    ];

    for (const re of patterns) {
      const m = html.match(re);
      if (m?.[1]) {
        const url = m[1].replace(/\\u0026/g, "&").replace(/\\\//g, "/").replace(/&amp;/g, "&");
        if (url.startsWith("http")) return { ok: true, thumbnailUrl: url };
      }
    }
    return { ok: false, reason: "no image in embed page" };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "fetch failed" };
  }
}

/** Try the documented route first, then the embed page. */
export async function findImage(postUrl: string): Promise<OEmbed> {
  const primary = await fetchOEmbed(postUrl);
  if (primary.ok) return primary;
  const fallback = await fetchEmbedImage(postUrl);
  return fallback.ok ? fallback : { ok: false, reason: `${primary.reason}; ${fallback.reason}` };
}

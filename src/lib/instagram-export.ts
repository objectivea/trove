/**
 * Parser for Instagram's "Download your information" export.
 *
 * The current export format nests everything in `label_values` entries — either
 * {label, value, href} pairs, or unlabelled blocks with a `title` ("Owner",
 * "Hashtags", "Media") holding a nested `dict`. An older format used
 * `string_map_data`; both are handled, because exports in the wild vary by
 * account age and request date.
 *
 * Worth knowing: the export already carries the owner handle and the caption for
 * essentially every save, so identification's first layer works entirely offline.
 * oEmbed is then only needed to recover the picture itself.
 */

export type SavedPost = {
  url: string;
  author: string | null;
  authorName: string | null;
  caption: string | null;
  hashtags: string[];
  collections: string[];
  savedAt: number | null;
};

type LabelValue = {
  label?: string | null;
  value?: string | null;
  href?: string | null;
  title?: string | null;
  dict?: LabelValue[];
};

type Entry = { timestamp?: number; label_values?: LabelValue[]; string_map_data?: Record<string, any> };

const clean = (u: string) => u.split("?")[0].replace(/\/$/, "") + "/";

/** Walk a nested block ("Owner", "Media", "Hashtags") collecting its leaf fields. */
function leaves(block: LabelValue): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  for (const group of block.dict ?? []) {
    const row: Record<string, string> = {};
    for (const field of group.dict ?? []) {
      if (field.label) row[field.label] = String(field.value ?? field.href ?? "");
    }
    if (Object.keys(row).length) out.push(row);
  }
  return out;
}

function parsePost(entry: Entry): SavedPost | null {
  // legacy shape, kept so older exports still import
  if (!entry.label_values && entry.string_map_data) {
    const smd = entry.string_map_data;
    const href = smd?.["Saved on"]?.href ?? smd?.["Added Time"]?.href;
    if (!href) return null;
    return {
      url: clean(String(href)),
      author: null, authorName: null, caption: null, hashtags: [], collections: [],
      savedAt: smd?.["Saved on"]?.timestamp ? smd["Saved on"].timestamp * 1000 : null,
    };
  }

  let url: string | null = null;
  let caption: string | null = null;
  let author: string | null = null;
  let authorName: string | null = null;
  const hashtags: string[] = [];

  for (const lv of entry.label_values ?? []) {
    if (lv.label === "URL") url = lv.href ?? lv.value ?? null;
    else if (lv.label === "Caption") caption = lv.value || null;
    else if (!lv.label && lv.title === "Owner") {
      const row = leaves(lv)[0];
      if (row) {
        author = row.Username || null;
        authorName = row.Name || null;
      }
    } else if (!lv.label && lv.title === "Hashtags") {
      for (const row of leaves(lv)) if (row.Name) hashtags.push(row.Name);
    }
  }

  if (!url) return null;
  return {
    url: clean(url),
    author, authorName, caption, hashtags,
    collections: [],
    savedAt: entry.timestamp ? entry.timestamp * 1000 : null,
  };
}

/** collection name -> the post urls filed under it */
export function parseCollections(json: unknown): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const list = Array.isArray(json) ? json : [];

  for (const entry of list as Entry[]) {
    const name = (entry.label_values ?? []).find((l) => l.label === "Name")?.value;
    if (!name) continue;

    const urls: string[] = [];
    for (const lv of entry.label_values ?? []) {
      if (!lv.label && lv.title === "Media") {
        for (const row of leaves(lv)) if (row.URL) urls.push(clean(row.URL));
      }
    }
    out.set(name, urls);
  }
  return out;
}

export function parseSavedPosts(json: unknown): SavedPost[] {
  const list = Array.isArray(json) ? json : (json as any)?.saved_saved_media ?? [];
  const seen = new Set<string>();
  const out: SavedPost[] = [];
  for (const entry of list as Entry[]) {
    const post = parsePost(entry);
    if (post && !seen.has(post.url)) {
      seen.add(post.url);
      out.push(post);
    }
  }
  return out;
}

/** Fold the collection names onto the posts they belong to. */
export function applyCollections(posts: SavedPost[], collections: Map<string, string[]>): SavedPost[] {
  const byUrl = new Map(posts.map((p) => [p.url, p]));
  for (const [name, urls] of collections) {
    for (const url of urls) {
      const post = byUrl.get(url);
      if (post && !post.collections.includes(name)) post.collections.push(name);
    }
  }
  return posts;
}

/** Decide what a file is from its shape rather than its name, which varies. */
export function looksLikeCollections(json: unknown): boolean {
  const first = Array.isArray(json) ? (json[0] as Entry | undefined) : undefined;
  return Boolean(
    first?.label_values?.some((l) => l.label === "Name") &&
    first?.label_values?.some((l) => !l.label && l.title === "Media")
  );
}

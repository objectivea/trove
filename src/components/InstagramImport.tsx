"use client";

import { useState } from "react";
import JSZip from "jszip";

type Post = { url: string; collection: string | null; savedAt: number | null };

/**
 * Instagram gives no API access to saved posts, so this reads the official
 * "Download your information" export instead. The ZIP is unpacked in the browser
 * and never uploaded — only the post URLs and their collection names are sent on.
 */
function extractPosts(json: unknown, collectionHint: string | null): Post[] {
  const out: Post[] = [];

  const walk = (node: any, collection: string | null) => {
    if (!node || typeof node !== "object") return;

    if (Array.isArray(node)) {
      node.forEach((n) => walk(n, collection));
      return;
    }

    // the export nests differently between versions; the shape we want is a
    // string_map_data entry carrying the post href
    const smd = node.string_map_data ?? node.string_list_data;
    if (smd) {
      const entries = Array.isArray(smd) ? smd : Object.values(smd);
      for (const e of entries as any[]) {
        const href = e?.href ?? e?.value;
        if (typeof href === "string" && href.includes("instagram.com/")) {
          out.push({
            url: href.split("?")[0],
            collection,
            savedAt: e?.timestamp ? e.timestamp * 1000 : null,
          });
        }
      }
    }

    for (const [key, value] of Object.entries(node)) {
      if (key === "string_map_data" || key === "string_list_data") continue;
      // keys like "saved_saved_media" or a collection's own name carry the folder
      const nextCollection =
        Array.isArray(value) && /collection|saved/i.test(key) && node.title
          ? String(node.title)
          : node.title && typeof node.title === "string"
            ? node.title
            : collection;
      walk(value, nextCollection);
    }
  };

  walk(json, collectionHint);

  const seen = new Set<string>();
  return out.filter((p) => !seen.has(p.url) && seen.add(p.url));
}

export function InstagramImport() {
  const [state, setState] = useState<"idle" | "reading" | "sending" | "done" | "error">("idle");
  const [found, setFound] = useState<Post[]>([]);
  const [result, setResult] = useState<{ imported: number; recovered: number; held: number; note?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File) {
    setState("reading");
    setError(null);
    try {
      const zip = await JSZip.loadAsync(file);
      const posts: Post[] = [];

      for (const [path, entry] of Object.entries(zip.files)) {
        if (entry.dir || !path.endsWith(".json")) continue;
        if (!/saved|collection/i.test(path)) continue;
        const hint = path.split("/").pop()?.replace(".json", "").replace(/_/g, " ") ?? null;
        try {
          posts.push(...extractPosts(JSON.parse(await entry.async("string")), hint));
        } catch { /* skip files that aren't what we're after */ }
      }

      const seen = new Set<string>();
      const unique = posts.filter((p) => !seen.has(p.url) && seen.add(p.url));
      setFound(unique);

      if (!unique.length) {
        setError("No saved posts found in that ZIP. Make sure you chose JSON format and ticked Saved.");
        setState("error");
        return;
      }

      setState("sending");
      let imported = 0, recovered = 0, held = 0, note: string | undefined;

      // chunked so a big library does not blow the request limit
      for (let i = 0; i < unique.length; i += 50) {
        const res = await fetch("/api/instagram/import", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ posts: unique.slice(i, i + 50) }),
        });
        const data = await res.json() as any;
        if (!res.ok) throw new Error(data.error ?? "import failed");
        imported += data.imported ?? 0;
        recovered += data.recovered ?? 0;
        held += data.held ?? 0;
        note = data.note ?? note;
        setResult({ imported, recovered, held, note });
      }

      setState("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that file");
      setState("error");
    }
  }

  return (
    <div>
      <div className="dropzone" style={{ display: "block" }}>
        <div className="disp" style={{ fontSize: 28, marginBottom: 12 }}>Instagram export</div>
        <ol style={{ fontSize: 11, lineHeight: 2, color: "var(--mid)", paddingLeft: 18, margin: "0 0 18px" }}>
          <li>Instagram → your profile → menu → <strong style={{ color: "var(--ink)" }}>Accounts Centre</strong></li>
          <li>Your information and permissions → <strong style={{ color: "var(--ink)" }}>Download your information</strong></li>
          <li>Some of your information → tick <strong style={{ color: "var(--ink)" }}>Saved</strong></li>
          <li>Format <strong style={{ color: "var(--ink)" }}>JSON</strong>, date range All time → submit</li>
        </ol>
        <input
          type="file"
          accept=".zip,application/zip"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          style={{ fontSize: 11 }}
        />
        <div className="fn" style={{ marginTop: 12 }}>
          The ZIP is unpacked in your browser. Only post links and collection names are sent on.
        </div>
      </div>

      {(state === "reading" || state === "sending") && (
        <div className="leader" style={{ marginTop: 22 }}>
          <span className="lbl ink">{state === "reading" ? "Unpacking" : `Recovering ${found.length} posts`}</span>
          <span className="dash" />
          <span className="lbl">{result ? `${result.imported} done` : "…"}</span>
        </div>
      )}

      {error && <p style={{ marginTop: 20, fontSize: 11, color: "var(--signal)" }}>{error}</p>}

      {result && (
        <div style={{ marginTop: 24, paddingTop: 18, borderTop: "1px solid var(--ink)" }}>
          <div className="lbl" style={{ marginBottom: 10 }}>Result</div>
          <div style={{ fontSize: 11, lineHeight: 1.9 }}>
            {result.imported} saves imported · {result.recovered} thumbnails recovered
            {result.held > 0 && <> · <span style={{ color: "var(--mid)" }}>{result.held} held as records</span></>}
          </div>
          {result.note && <div className="fn" style={{ marginTop: 8 }}>{result.note}</div>}
          <div className="fn" style={{ marginTop: 8 }}>
            Imported references are queued — run enrichment to give them tags, palettes and search.
          </div>
        </div>
      )}
    </div>
  );
}

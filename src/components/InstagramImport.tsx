"use client";

import { useState } from "react";
import JSZip from "jszip";
import {
  parseSavedPosts,
  parseCollections,
  applyCollections,
  looksLikeCollections,
  type SavedPost,
} from "@/lib/instagram-export";

type Result = { imported: number; skipped: number; recovered: number; held: number; note?: string };

/**
 * Instagram gives no API access to saved posts, so this reads the official data
 * export. The ZIP is unpacked in the browser and never uploaded — only the post
 * links, captions, account handles and collection names are sent on.
 *
 * Loose .json files are accepted too, because the two files that matter
 * (saved_posts.json and saved_collections.json) are often all anyone needs.
 */
export function InstagramImport() {
  const [state, setState] = useState<"idle" | "reading" | "sending" | "done" | "error">("idle");
  const [found, setFound] = useState<SavedPost[]>([]);
  const [sent, setSent] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fetchImages, setFetchImages] = useState(true);

  async function readFiles(files: FileList) {
    setState("reading");
    setError(null);
    setResult(null);
    setSent(0);

    try {
      const docs: unknown[] = [];

      for (const file of Array.from(files)) {
        if (file.name.toLowerCase().endsWith(".zip")) {
          const zip = await JSZip.loadAsync(file);
          for (const [path, entry] of Object.entries(zip.files)) {
            if (entry.dir || !path.endsWith(".json")) continue;
            if (!/saved/i.test(path)) continue;
            try { docs.push(JSON.parse(await entry.async("string"))); } catch { /* not ours */ }
          }
        } else {
          try { docs.push(JSON.parse(await file.text())); } catch { /* not ours */ }
        }
      }

      if (!docs.length) throw new Error("No readable JSON found. Choose the export ZIP, or saved_posts.json and saved_collections.json together.");

      const collections = new Map<string, string[]>();
      let posts: SavedPost[] = [];

      for (const doc of docs) {
        if (looksLikeCollections(doc)) {
          for (const [name, urls] of parseCollections(doc)) collections.set(name, urls);
        } else {
          posts = posts.concat(parseSavedPosts(doc));
        }
      }

      const seen = new Set<string>();
      const unique = applyCollections(
        posts.filter((p) => !seen.has(p.url) && seen.add(p.url)),
        collections
      );
      setFound(unique);

      if (!unique.length) {
        throw new Error("No saved posts in those files. Make sure you picked JSON format and ticked Saved.");
      }

      setState("sending");
      const totals: Result = { imported: 0, skipped: 0, recovered: 0, held: 0 };

      for (let i = 0; i < unique.length; i += 50) {
        const res = await fetch("/api/instagram/import", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ posts: unique.slice(i, i + 50), fetchImages }),
        });
        const data = await res.json() as any;
        if (!res.ok) throw new Error(data.error ?? "import failed");
        totals.imported += data.imported ?? 0;
        totals.skipped += data.skipped ?? 0;
        totals.recovered += data.recovered ?? 0;
        totals.held += data.held ?? 0;
        totals.note = data.note ?? totals.note;
        setSent(Math.min(i + 50, unique.length));
        setResult({ ...totals });
      }

      setState("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read those files");
      setState("error");
    }
  }

  const collectionTally = found.reduce<Record<string, number>>((acc, p) => {
    for (const c of p.collections) acc[c] = (acc[c] ?? 0) + 1;
    return acc;
  }, {});

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
          accept=".zip,.json,application/zip,application/json"
          multiple
          onChange={(e) => e.target.files?.length && readFiles(e.target.files)}
          style={{ fontSize: 11 }}
        />

        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, fontSize: 11, color: "var(--mid)" }}>
          <input type="checkbox" checked={fetchImages} onChange={(e) => setFetchImages(e.target.checked)} />
          Try to recover thumbnails (slower; private and deleted posts will not resolve)
        </label>

        <div className="fn" style={{ marginTop: 12 }}>
          The ZIP is unpacked in your browser. Only links, captions, accounts and collection names are sent on.
          You can also select saved_posts.json and saved_collections.json directly.
        </div>
      </div>

      {found.length > 0 && (
        <>
          <div className="leader" style={{ marginTop: 24 }}>
            <span className="lbl ink">{found.length.toLocaleString("en-GB")} saves found</span>
            <span className="dash" />
            <span className="lbl">
              {state === "sending" ? `importing ${sent} of ${found.length}` : `${Object.keys(collectionTally).length} collections`}
            </span>
          </div>

          {Object.keys(collectionTally).length > 0 && (
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 14 }}>
              {Object.entries(collectionTally).sort((a, b) => b[1] - a[1]).map(([name, n]) => (
                <span key={name} className="brk on">[ {name} {n} ]</span>
              ))}
            </div>
          )}
        </>
      )}

      {error && <p style={{ marginTop: 20, fontSize: 11, color: "var(--signal)" }}>{error}</p>}

      {result && (
        <div style={{ marginTop: 24, paddingTop: 18, borderTop: "1px solid var(--ink)" }}>
          <div className="lbl" style={{ marginBottom: 10 }}>Result</div>
          <div style={{ fontSize: 11, lineHeight: 1.9 }}>
            {result.imported} imported
            {result.skipped > 0 && <> · {result.skipped} already here</>}
            {" · "}{result.recovered} thumbnails recovered
            {result.held > 0 && <> · <span style={{ color: "var(--mid)" }}>{result.held} held as records</span></>}
          </div>
          {result.note && <div className="fn" style={{ marginTop: 8 }}>{result.note}</div>}
          <div className="fn" style={{ marginTop: 8 }}>
            Captions, accounts and collections are searchable straight away. Run enrichment to add tags, palettes and similarity.
          </div>
        </div>
      )}
    </div>
  );
}

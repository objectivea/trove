"use client";

import { useCallback, useRef, useState } from "react";
import { quantise, toHex, nameFor, type RGB } from "@/lib/palette";

type Row = {
  name: string;
  status: "reading" | "uploading" | "enriching" | "ready" | "failed";
  palette: { hex: string; name: string; share: number }[];
  error?: string;
  preview?: string;
};

/**
 * Colour is pulled out of the bitmap here in the browser — instant, and it costs
 * no API credit. Only the description and embedding need the model.
 */
async function readImage(file: File) {
  const url = URL.createObjectURL(file);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("could not decode image"));
    el.src = url;
  });

  const scale = Math.min(1, 160 / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("no canvas context");
  ctx.drawImage(img, 0, 0, w, h);

  const { data } = ctx.getImageData(0, 0, w, h);
  const pixels: RGB[] = [];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    const rgb: RGB = [data[i], data[i + 1], data[i + 2]];
    // skip near-white paper so a scanned page does not read as one big white swatch
    if (rgb[0] > 246 && rgb[1] > 246 && rgb[2] > 246) continue;
    pixels.push(rgb);
  }

  const palette = quantise(pixels, 5).map((p) => ({
    hex: toHex(p.rgb),
    name: nameFor(p.rgb),
    share: Math.round(p.share * 100) / 100,
  }));

  return { url, width: img.width, height: img.height, palette };
}

export function Uploader({ onDone }: { onDone?: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [hot, setHot] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const handle = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!list.length) return;

    setRows((prev) => [
      ...list.map((f) => ({ name: f.name, status: "reading" as const, palette: [] })),
      ...prev,
    ]);

    for (const file of list) {
      const patch = (p: Partial<Row>) =>
        setRows((prev) => prev.map((r) => (r.name === file.name ? { ...r, ...p } : r)));

      try {
        const meta = await readImage(file);
        patch({ status: "uploading", palette: meta.palette, preview: meta.url });

        const form = new FormData();
        form.set("file", file);
        form.set("palette", JSON.stringify(meta.palette));
        form.set("width", String(meta.width));
        form.set("height", String(meta.height));

        patch({ status: "enriching" });
        const res = await fetch("/api/upload", { method: "POST", body: form });
        const data = await res.json() as any;

        if (!res.ok) throw new Error(data.error ?? `upload failed (${res.status})`);
        patch({ status: data.enriched ? "ready" : "failed", error: data.error });
      } catch (e) {
        patch({ status: "failed", error: e instanceof Error ? e.message : "failed" });
      }
    }
    onDone?.();
  }, [onDone]);

  const done = rows.filter((r) => r.status === "ready").length;

  return (
    <>
      <div
        className={`dropzone${hot ? " hot" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setHot(true); }}
        onDragLeave={() => setHot(false)}
        onDrop={(e) => { e.preventDefault(); setHot(false); handle(e.dataTransfer.files); }}
        onClick={() => input.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") input.current?.click(); }}
        style={{ cursor: "pointer" }}
      >
        <div className="disp" style={{ fontSize: 28 }}>Drop anything</div>
        <div style={{ fontSize: 11, lineHeight: 1.8, color: "var(--mid)" }}>
          Screenshots, stills, frames.<br />
          No folder to choose, no tags to write — filing happens after.
        </div>
        <div style={{ flexGrow: 1 }} />
        <div style={{ textAlign: "right" }}>
          <div className="disp" style={{ fontSize: 34 }}>{done}/{rows.length || 0}</div>
          <div className="lbl" style={{ marginTop: 4 }}>Enriched</div>
        </div>
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => e.target.files && handle(e.target.files)}
        />
      </div>

      {rows.length > 0 && (
        <>
          <div className="leader" style={{ marginTop: 26 }}>
            <span className="lbl ink">Enrichment log</span>
            <span className="dash" />
            <span className="lbl">Newest first</span>
          </div>
          <table className="rows">
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.name}-${i}`}>
                  <td style={{ width: 100 }}>
                    <div
                      className="t"
                      style={{
                        width: 88, height: 62,
                        backgroundImage: r.preview ? `url(${r.preview})` : undefined,
                      }}
                    />
                  </td>
                  <td style={{ width: 260 }}>
                    <div style={{ fontSize: 11 }}>{r.name}</div>
                    {r.error && <div className="fn" style={{ color: "var(--signal)" }}>{r.error}</div>}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 0 }}>
                      {r.palette.map((p) => (
                        <span key={p.hex} title={`${p.name} ${p.hex}`} style={{ width: 22, height: 22, background: p.hex }} />
                      ))}
                    </div>
                  </td>
                  <td style={{ width: 110, textAlign: "right" }}>
                    <span className="lbl" style={{ color: r.status === "failed" ? "var(--signal)" : r.status === "ready" ? "var(--ink)" : "var(--mid)" }}>
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}

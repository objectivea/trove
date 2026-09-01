import Link from "next/link";
import type { Reference } from "@/lib/types";

/** One reference in the grid: hard-edged image, filename beneath it. Always. */
export function Tile({ ref_, height }: { ref_: Reference; height?: number }) {
  const ratio = ref_.width && ref_.height ? ref_.height / ref_.width : 0.75;
  const h = height ?? Math.round(240 * Math.min(1.5, Math.max(0.55, ratio)));

  return (
    <Link href={`/reference/${ref_.id}`} className="cell" style={{ display: "block", color: "inherit" }}>
      <div
        className={`t${ref_.mediaKey ? "" : " ph"}`}
        style={{
          height: h,
          backgroundImage: ref_.mediaKey ? `url(/api/media/${ref_.mediaKey})` : undefined,
        }}
      />
      <div className="fn">{ref_.filename}</div>
      {ref_.ident.maker && (
        <div className="fn" style={{ marginTop: 3 }}>
          {[ref_.ident.maker, ref_.ident.place].filter(Boolean).join(" · ")}
        </div>
      )}
      {ref_.status === "queued" && <div className="fn" style={{ marginTop: 3, color: "var(--signal)" }}>queued</div>}
    </Link>
  );
}

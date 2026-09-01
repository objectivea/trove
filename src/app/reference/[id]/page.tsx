import Link from "next/link";
import { notFound } from "next/navigation";
import { getReference, listReferences } from "@/lib/db";
import { Nav } from "@/components/Nav";
import { IdentifyPanel } from "@/components/IdentifyPanel";

export const dynamic = "force-dynamic";

export default async function ReferencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ref = await getReference(id);
  if (!ref) notFound();

  const neighbours = ref.clusterId
    ? (await listReferences({ cluster: ref.clusterId, limit: 9 })).filter((r) => r.id !== ref.id).slice(0, 8)
    : [];

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {/* plate */}
      <div style={{ flexGrow: 1, minWidth: 0, padding: "34px 36px 0 40px", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
          <Link href="/" className="nav ul">&larr; Library</Link>
          <span className="lbl" style={{ marginLeft: "auto" }}>{ref.source}</span>
        </div>
        <div className="rule" />
        <div
          className={`t${ref.mediaKey ? "" : " ph"}`}
          style={{
            flexGrow: 1,
            marginTop: 26,
            minHeight: 420,
            backgroundImage: ref.mediaKey ? `url(/api/media/${ref.mediaKey})` : undefined,
            backgroundSize: "contain",
            backgroundRepeat: "no-repeat",
          }}
        />
        <div className="fn" style={{ marginBottom: 22 }}>
          {ref.filename}
          {ref.width ? ` · ${ref.width} × ${ref.height}` : ""}
          {ref.author ? ` · saved from Instagram / @${ref.author}` : ""}
        </div>
      </div>

      {/* record */}
      <div
        style={{
          width: 452,
          flexShrink: 0,
          borderLeft: "1px solid var(--ink)",
          padding: "34px 36px",
          display: "flex",
          flexDirection: "column",
          gap: 22,
        }}
      >
        <div className="leader">
          <span className="lbl ink">[ Record ]</span>
          <span className="dash" />
          <span className="lbl">{ref.status}</span>
        </div>

        <IdentifyPanel reference={ref} />

        {ref.tags.length > 0 && (
          <div>
            <div className="lbl" style={{ marginBottom: 9 }}>Written by the AI on import</div>
            <div style={{ fontSize: 11, lineHeight: 2, letterSpacing: ".06em", textTransform: "uppercase" }}>
              {[...ref.tags, ...ref.style].map((t) => `[ ${t} ]`).join("  ")}
            </div>
          </div>
        )}

        {ref.palette.length > 0 && (
          <div>
            <div className="lbl" style={{ marginBottom: 9 }}>Palette</div>
            <div style={{ display: "flex", gap: 14 }}>
              {ref.palette.slice(0, 5).map((p) => (
                <div key={p.hex}>
                  <div style={{ width: 46, height: 32, background: p.hex }} />
                  <div className="fn" style={{ marginTop: 4 }}>{p.hex.replace("#", "").toUpperCase()}</div>
                  <div className="fn" style={{ marginTop: 2 }}>{p.name}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {ref.caption && (
          <div>
            <div className="lbl" style={{ marginBottom: 9 }}>Original caption</div>
            <p style={{ fontSize: 11, lineHeight: 1.8, color: "var(--mid)", margin: 0 }}>{ref.caption}</p>
          </div>
        )}

        {neighbours.length > 0 && (
          <div style={{ marginTop: "auto" }}>
            <div className="leader" style={{ marginBottom: 10 }}>
              <span className="lbl ink">More like this</span>
              <span className="dash" />
            </div>
            <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
              {neighbours.map((n) => (
                <Link key={n.id} href={`/reference/${n.id}`}>
                  <div
                    className={`t${n.mediaKey ? "" : " ph"}`}
                    style={{
                      width: 78,
                      height: 58,
                      backgroundImage: n.mediaKey ? `url(/api/media/${n.mediaKey})` : undefined,
                    }}
                  />
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

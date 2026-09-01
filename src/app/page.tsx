import Link from "next/link";
import { listReferences, countReferences, listCollections } from "@/lib/db";
import { Nav } from "@/components/Nav";
import { Tile } from "@/components/Tile";
import { SearchBar } from "@/components/SearchBar";

export const dynamic = "force-dynamic";

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ collection?: string }>;
}) {
  const { collection } = await searchParams;
  const [items, total, collections] = await Promise.all([
    listReferences({ limit: 120, collection: collection ?? null }),
    countReferences(),
    listCollections(),
  ]);

  const lastImport = items[0]?.createdAt
    ? new Date(items[0].createdAt).toLocaleDateString("en-GB")
    : "—";

  return (
    <>
      <div className="shell">
        <Nav
          active="Library"
          right={
            <>
              <span className="nav" style={{ fontWeight: 700 }}>Grid</span>
              <Link href="/explore" className="nav" style={{ color: "var(--mid)" }}>Explore</Link>
              <Link href="/import" className="nav ul">+ Add</Link>
            </>
          }
        />

        <div style={{ display: "flex", alignItems: "baseline", gap: 16, paddingTop: 13, flexWrap: "wrap" }}>
          <span className="lbl">Collections</span>
          <Link href="/" className={`brk${!collection ? " on" : ""}`}>[ All {total} ]</Link>
          {collections.map((c) => (
            <Link
              key={c.id}
              href={`/?collection=${c.id}`}
              className={`brk${collection === c.id ? " on" : ""}`}
            >
              [ {c.name} {c.n} ]
            </Link>
          ))}
          <div style={{ flexGrow: 1 }} />
          <SearchBar />
        </div>

        <div className="leader" style={{ marginTop: 15 }}>
          <span className="lbl ink">{total.toLocaleString("en-GB")} references</span>
          <span className="dash" />
          <span className="lbl">
            Last added {lastImport} · {collections.length} collections
          </span>
        </div>

        {items.length === 0 ? (
          <Empty />
        ) : (
          <div className="masonry" style={{ paddingTop: 26 }}>
            {items.map((r) => <Tile key={r.id} ref_={r} />)}
          </div>
        )}
      </div>
    </>
  );
}

function Empty() {
  return (
    <div style={{ padding: "80px 0 40px", maxWidth: 640 }}>
      <div className="disp" style={{ fontSize: 34 }}>Nothing filed yet</div>
      <p style={{ fontSize: 12, lineHeight: 1.9, color: "var(--mid)", marginTop: 18 }}>
        Drop images in and the library writes its own tags, pulls the palette out of the pixels
        and works out what it is looking at. Or bring your Instagram saves across with their
        collection names intact.
      </p>
      <div style={{ display: "flex", gap: 8, marginTop: 22 }}>
        <Link href="/import" className="btn k">Add references</Link>
        <Link href="/import?tab=instagram" className="btn">Import Instagram export</Link>
      </div>
    </div>
  );
}

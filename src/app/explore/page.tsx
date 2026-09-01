import Link from "next/link";
import { listReferences } from "@/lib/db";
import { env } from "@/lib/env";
import { Nav } from "@/components/Nav";
import { ExploreCanvas } from "@/components/ExploreCanvas";

export const dynamic = "force-dynamic";

export default async function ExplorePage() {
  const { DB } = await env();
  const [references, clusters] = await Promise.all([
    listReferences({ limit: 400 }),
    DB.prepare(`SELECT id, name, size FROM clusters ORDER BY size DESC`)
      .all()
      .then((r) => r.results as unknown as { id: string; name: string; size: number }[])
      .catch(() => []),
  ]);

  return (
    <>
      <div style={{ padding: "34px 40px 0" }}>
        <Nav
          active="Library"
          right={
            <>
              <Link href="/" className="nav" style={{ color: "var(--mid)" }}>Grid</Link>
              <span className="nav" style={{ fontWeight: 700 }}>Explore</span>
              <Link href="/import" className="nav ul">+ Add</Link>
            </>
          }
        />
      </div>
      <ExploreCanvas references={references} clusters={clusters} />
    </>
  );
}

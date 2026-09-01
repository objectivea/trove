import { Nav } from "@/components/Nav";
import { Ticker } from "@/components/Ticker";
import { ImportTabs } from "@/components/ImportTabs";
import { countReferences, listCollections } from "@/lib/db";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const { DB } = await env();

  const [total, collections, queued] = await Promise.all([
    countReferences(),
    listCollections(),
    DB.prepare(`SELECT COUNT(*) AS n FROM references_ WHERE status IN ('queued','failed')`)
      .first<{ n: number }>()
      .then((r) => r?.n ?? 0)
      .catch(() => 0),
  ]);

  return (
    <>
      <Ticker
        label="Trove_Import"
        items={[
          `${total.toLocaleString("en-GB")} references`,
          `${queued} awaiting enrichment`,
          `${collections.length} collections`,
        ]}
      />
      <div className="shell">
        <Nav active="Import" />
        <ImportTabs initial={tab === "instagram" ? "instagram" : "upload"} queued={queued} />
      </div>
    </>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Uploader } from "./Uploader";
import { InstagramImport } from "./InstagramImport";

export function ImportTabs({ initial, queued }: { initial: "upload" | "instagram"; queued: number }) {
  const [tab, setTab] = useState(initial);
  const [draining, setDraining] = useState(false);
  const [drained, setDrained] = useState<number | null>(null);
  const router = useRouter();

  async function enrichQueue() {
    setDraining(true);
    let processed = 0;
    try {
      // small batches so a long queue does not exceed the request budget
      for (let i = 0; i < 20; i++) {
        const res = await fetch("/api/enrich", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ batch: 5 }),
        });
        const data = await res.json() as any;
        processed += data.processed ?? 0;
        if (!data.processed) break;
        setDrained(processed);
      }
      router.refresh();
    } finally {
      setDraining(false);
    }
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "baseline", gap: 16, paddingTop: 13, flexWrap: "wrap" }}>
        <span className="lbl">Source</span>
        <button className="brk" aria-pressed={tab === "upload"} onClick={() => setTab("upload")}>[ Upload ]</button>
        <button className="brk" aria-pressed={tab === "instagram"} onClick={() => setTab("instagram")}>[ Instagram export ]</button>
        <div style={{ flexGrow: 1 }} />
        {queued > 0 && (
          <button className="btn k" onClick={enrichQueue} disabled={draining}>
            {draining ? `Enriching… ${drained ?? 0}` : `Enrich ${queued} queued`}
          </button>
        )}
      </div>

      <div style={{ marginTop: 26, maxWidth: 1100 }}>
        {tab === "upload" ? <Uploader onDone={() => router.refresh()} /> : <InstagramImport />}
      </div>
    </>
  );
}

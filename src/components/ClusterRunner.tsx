"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ClusterRunner({ hasClusters }: { hasClusters: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/clusters", { method: "POST" });
      const data = await res.json() as any;
      if (!res.ok) setError(data.error ?? "Grouping failed");
      else router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {error && <span className="fn" style={{ color: "var(--signal)", margin: 0 }}>{error}</span>}
      <button className="btn k" onClick={run} disabled={busy}>
        {busy ? "Grouping…" : hasClusters ? "Regroup" : "Group the library"}
      </button>
    </>
  );
}

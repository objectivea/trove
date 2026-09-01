"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SearchBar({ initial = "" }: { initial?: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initial);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
      }}
    >
      <input
        className="nav ul"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search or describe a vibe …"
        aria-label="Search the library"
        style={{
          border: 0,
          borderBottom: "1px solid var(--ink)",
          background: "none",
          fontFamily: "var(--mono)",
          padding: "2px 0",
          width: 260,
          textDecoration: "none",
        }}
      />
    </form>
  );
}

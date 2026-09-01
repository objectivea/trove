import Link from "next/link";

const SECTIONS = [
  { href: "/", label: "Library" },
  { href: "/boards", label: "Boards" },
  { href: "/clusters", label: "Clusters" },
  { href: "/palettes", label: "Palettes" },
  { href: "/import", label: "Import" },
];

export function Nav({ active, right }: { active: string; right?: React.ReactNode }) {
  return (
    <>
      <div className="navrow">
        <Link href="/" className="nav" style={{ fontWeight: 700 }}>TROVE</Link>
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className={`nav${s.label === active ? " ul" : ""}`}
            style={{ color: s.label === active ? "var(--ink)" : "var(--mid)" }}
          >
            {s.label}
          </Link>
        ))}
        <div style={{ flexGrow: 1 }} />
        {right}
      </div>
      <div className="rule" />
    </>
  );
}

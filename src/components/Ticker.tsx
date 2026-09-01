export function Ticker({ label, items }: { label: string; items: (string | null | undefined)[] }) {
  return (
    <div className="ticker">
      <span>[ {label} ]</span>
      {items.filter(Boolean).map((t, i) => (
        <span key={i}>{i === 0 ? t : <>&#8599; {t}</>}</span>
      ))}
      <span className="sp" />
      <span>{new Date().toLocaleDateString("en-GB")}</span>
    </div>
  );
}

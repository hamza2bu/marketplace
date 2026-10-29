/** Read-only star rating. `label` is the accessible text, e.g. "4.5 out of 5 stars". */
export function Stars({ rating, label, size = "sm" }: { rating: number; label: string; size?: "sm" | "lg" }) {
  const pct = Math.max(0, Math.min(100, (rating / 5) * 100));
  return (
    <span role="img" aria-label={label} className={`relative inline-block leading-none ${size === "lg" ? "text-xl" : "text-sm"}`}>
      <span className="text-border">★★★★★</span>
      {/* Fill from the start edge, so it reads correctly in RTL too. */}
      <span className="absolute inset-y-0 start-0 overflow-hidden text-amber-500" style={{ width: `${pct}%` }}>
        ★★★★★
      </span>
    </span>
  );
}

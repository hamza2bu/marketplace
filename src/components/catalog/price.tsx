import { formatMoney } from "@/lib/money";

export function Price({
  amount,
  compareAt,
  locale,
  size = "md",
}: {
  amount: number;
  compareAt?: number | null;
  locale: string;
  size?: "md" | "lg";
}) {
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2">
      <span className={`font-semibold ${size === "lg" ? "text-3xl" : "text-base"} ${compareAt ? "text-danger" : ""}`}>
        {formatMoney(amount, locale)}
      </span>
      {compareAt ? <s className="text-sm text-muted">{formatMoney(compareAt, locale)}</s> : null}
    </span>
  );
}

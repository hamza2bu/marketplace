import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SalesChart } from "@/components/seller/sales-chart";
import { Stat } from "@/components/seller/stat";
import { localized } from "@/lib/i18n-text";
import { formatMoney } from "@/lib/money";
import { requireSeller } from "@/server/auth/guards";
import { balances, commissionBreakdown, currentRates, dailySales, payoutHistory, RANGES, salesSummary, topProducts, type RangeDays } from "@/server/seller/analytics";

export const metadata: Metadata = { robots: { index: false } };

export default async function EarningsPage({ params, searchParams }: PageProps<"/[locale]/seller/earnings">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { shop } = await requireSeller(locale);
  const daysParam = Number((await searchParams).days);
  const days: RangeDays = RANGES.find((r) => r === daysParam) ?? 30;

  const [t, dash, ordersT, transferT, summary, series, top, money, breakdown, rates, payouts] = await Promise.all([
    getTranslations("seller.earnings"),
    getTranslations("seller.dashboard"),
    getTranslations("seller.orders"),
    getTranslations("seller.transferStatus"),
    salesSummary(shop.id, days),
    dailySales(shop.id, days),
    topProducts(shop.id, days),
    balances(shop.id),
    commissionBreakdown(shop.id),
    currentRates(shop.id),
    payoutHistory(shop.id),
  ]);
  const fmt = (n: number) => formatMoney(n, locale);
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  const pct = (bps: number) => `${(bps / 100).toLocaleString(locale, { maximumFractionDigits: 2 })}%`;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <nav className="flex gap-2" aria-label={t("title")}>
          {RANGES.map((r) => (
            <Link
              key={r}
              href={`/seller/earnings?days=${r}`}
              aria-current={r === days ? "page" : undefined}
              className={`rounded-full px-3 py-1 text-sm ${r === days ? "bg-brand text-brand-foreground" : "bg-surface"}`}
            >
              {t("range", { days: r })}
            </Link>
          ))}
        </nav>
      </div>

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label={dash("gross")} value={fmt(summary.grossMinor)} />
        <Stat label={t("commission")} value={`−${fmt(summary.commissionMinor)}`} />
        <Stat label={t("refunds")} value={`−${fmt(summary.refundsMinor)}`} />
        <Stat label={dash("net")} value={fmt(summary.netMinor)} />
        <Stat label={dash("orders")} value={summary.orders} />
      </dl>

      <section className="space-y-2">
        <h2 className="font-semibold">{t("chart")}</h2>
        {summary.grossMinor === 0 ? (
          <p className="text-sm text-muted">{t("noSales")}</p>
        ) : (
          <SalesChart
            data={series}
            locale={locale}
            label={t("chartLabel", { days, total: fmt(summary.grossMinor) })}
            tableLabel={t("showTable")}
            dayLabel={t("day")}
            amountLabel={t("sales")}
          />
        )}
      </section>

      <dl className="grid gap-3 sm:grid-cols-3">
        <Stat label={dash("held")} value={fmt(money.heldMinor)} hint={dash("heldHint")} />
        <Stat label={dash("available")} value={fmt(money.availableMinor)} />
        <Stat label={dash("paidOut")} value={fmt(money.paidOutMinor)} />
      </dl>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-2">
          <h2 className="font-semibold">{t("topProducts")}</h2>
          {top.length === 0 ? (
            <p className="text-sm text-muted">{t("noSales")}</p>
          ) : (
            <ol className="divide-y divide-border rounded-lg border border-border text-sm">
              {top.map((p, i) => (
                <li key={i} className="flex justify-between gap-3 p-3">
                  <span className="truncate">{p.product?.title ?? "—"}</span>
                  <span className="shrink-0 text-muted">
                    {t("unitsSold", { count: p.units })} · <span className="text-foreground">{fmt(p.revenueMinor)}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
        <section className="space-y-2">
          <h2 className="font-semibold">{t("rates")}</h2>
          <p className="text-xs text-muted">{t("ratesHint")}</p>
          <ul className="divide-y divide-border rounded-lg border border-border text-sm">
            {rates.map((r) => (
              <li key={r.id} className="flex justify-between p-2">
                <span>
                  {r.parentName ? `${localized(r.parentName, locale)} › ` : ""}
                  {localized(r.name, locale)}
                </span>
                <span className="font-medium tabular-nums">{pct(r.bps)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="space-y-2">
        <h2 className="font-semibold">{t("breakdown")}</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="border-b border-border text-muted">
                <th className="p-2 text-start font-medium">{ordersT("colOrder")}</th>
                <th className="p-2 text-start font-medium">{ordersT("subtotal")}</th>
                <th className="p-2 text-start font-medium">{t("rate")}</th>
                <th className="p-2 text-start font-medium">{ordersT("commission")}</th>
                <th className="p-2 text-start font-medium">{ordersT("net")}</th>
                <th className="p-2 text-start font-medium">{ordersT("transfer")}</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.map((s) => {
                const rateSet = [...new Set(s.items.map((i) => i.commissionBps))];
                return (
                  <tr key={s.id} className="border-b border-border">
                    <td className="p-2">
                      <Link href={`/seller/orders/${s.id}`} dir="ltr" className="text-brand underline">
                        {s.order.number}
                      </Link>
                      <span className="block text-xs text-muted">{s.order.paidAt ? dateFmt.format(s.order.paidAt) : ""}</span>
                    </td>
                    <td className="p-2 tabular-nums">{fmt(s.subtotalMinor)}</td>
                    <td className="p-2 tabular-nums">{rateSet.map(pct).join(" / ")}</td>
                    <td className="p-2 tabular-nums">−{fmt(s.commissionMinor)}</td>
                    <td className="p-2 font-semibold tabular-nums">{fmt(s.sellerNetMinor)}</td>
                    <td className="p-2 text-xs">{transferT(s.transferStatus)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">{t("payouts")}</h2>
        {payouts.length === 0 ? (
          <p className="text-sm text-muted">{t("noPayouts")}</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border text-sm">
            {payouts.map((p) => (
              <li key={p.id} className="flex justify-between p-3">
                <span>{dateFmt.format(p.paidAt ?? p.createdAt)}</span>
                <span className="text-muted">{t(`payoutStatus.${p.status}`)}</span>
                <span className="font-semibold">{fmt(p.amountMinor)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

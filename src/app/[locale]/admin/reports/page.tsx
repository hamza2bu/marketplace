import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SalesChart } from "@/components/seller/sales-chart";
import { Stat } from "@/components/seller/stat";
import { localized } from "@/lib/i18n-text";
import { formatMoney } from "@/lib/money";
import { requireAdmin } from "@/server/auth/guards";
import { byCategory, dailySeries, platformSummary, REPORT_RANGES, topShops, type ReportDays } from "@/server/admin/reports";

export const metadata: Metadata = { robots: { index: false } };

export default async function AdminReportsPage({ params, searchParams }: PageProps<"/[locale]/admin/reports">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin(locale);
  const daysParam = Number((await searchParams).days);
  const days: ReportDays = REPORT_RANGES.find((r) => r === daysParam) ?? 30;
  const [t, common, overview, earnings, summary, gmv, commission, shops, categories] = await Promise.all([
    getTranslations("admin.reports"),
    getTranslations("admin.common"),
    getTranslations("admin.overview"),
    getTranslations("seller.earnings"),
    platformSummary(days),
    dailySeries("gmv", days),
    dailySeries("commission", days),
    topShops(days),
    byCategory(days),
  ]);
  const fmt = (n: number) => formatMoney(n, locale);
  const chart = (title: string, data: typeof gmv) =>
    data.some((d) => d.amountMinor > 0) ? (
      <SalesChart data={data} locale={locale} label={t("chartLabel", { title, days })} tableLabel={earnings("showTable")} dayLabel={earnings("day")} amountLabel={title} />
    ) : (
      <p className="text-sm text-muted">{common("none")}</p>
    );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <nav className="flex flex-wrap gap-2">
          {REPORT_RANGES.map((r) => (
            <Link key={r} href={`/admin/reports?days=${r}`} aria-current={r === days ? "page" : undefined} className={`rounded-full px-3 py-1 text-sm ${r === days ? "bg-brand text-brand-foreground" : "bg-surface"}`}>
              {t("range", { days: r })}
            </Link>
          ))}
        </nav>
      </div>
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={overview("gmv")} value={fmt(summary.gmvMinor)} />
        <Stat label={overview("commission")} value={fmt(summary.commissionMinor)} />
        <Stat label={overview("orders")} value={summary.orders} />
        <Stat label={overview("aov")} value={fmt(summary.averageOrderMinor)} />
        <Stat label={t("refunds")} value={fmt(summary.refundsMinor)} />
        <Stat label={t("newCustomers")} value={summary.newCustomers} />
        <Stat label={t("newShops")} value={summary.newShops} />
      </dl>
      {/* Two charts, not one with two axes: the scales differ by ~10×. */}
      <section className="space-y-2">
        <h2 className="font-semibold">{t("gmvChart")}</h2>
        {chart(t("gmvChart"), gmv)}
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold">{t("commissionChart")}</h2>
        {chart(t("commissionChart"), commission)}
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-2">
          <h2 className="font-semibold">{t("topShops")}</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted">
                <th className="p-2 text-start font-medium" />
                <th className="p-2 text-end font-medium">{t("sales")}</th>
                <th className="p-2 text-end font-medium">{t("commission")}</th>
              </tr>
            </thead>
            <tbody>
              {shops.map((s, i) => (
                <tr key={i} className="border-b border-border">
                  <td className="p-2">{s.shop?.name ?? "—"}</td>
                  <td className="p-2 text-end tabular-nums">{fmt(s.salesMinor)}</td>
                  <td className="p-2 text-end tabular-nums">{fmt(s.commissionMinor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="space-y-2">
          <h2 className="font-semibold">{t("byCategory")}</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted">
                <th className="p-2 text-start font-medium" />
                <th className="p-2 text-end font-medium">{t("sales")}</th>
                <th className="p-2 text-end font-medium">{t("commission")}</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c, i) => (
                <tr key={i} className="border-b border-border">
                  <td className="p-2">{c.name ? localized(c.name, locale) : "—"}</td>
                  <td className="p-2 text-end tabular-nums">{fmt(c.salesMinor)}</td>
                  <td className="p-2 text-end tabular-nums">{fmt(c.commissionMinor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
      <section className="space-y-1">
        <a href={`/api/admin/report?days=${days}`} className="inline-block rounded-md border border-border px-3 py-2 text-sm font-medium" download>
          {common("export")}
        </a>
        <p className="text-xs text-muted">{t("csvHint")}</p>
      </section>
    </div>
  );
}

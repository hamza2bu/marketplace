import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Stat } from "@/components/seller/stat";
import { formatMoney } from "@/lib/money";
import { requireAdmin } from "@/server/auth/guards";
import { db } from "@/server/db";
import { payableShops } from "@/server/admin/payouts";
import { platformSummary } from "@/server/admin/reports";

export const metadata: Metadata = { robots: { index: false } };

export default async function AdminOverviewPage({ params }: PageProps<"/[locale]/admin">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin(locale);
  const [t, summary, pendingShops, pendingProducts, disputes, flagged, payable] = await Promise.all([
    getTranslations("admin.overview"),
    platformSummary(30),
    db.shop.count({ where: { status: "PENDING" } }),
    db.product.count({ where: { status: "PENDING_REVIEW" } }),
    db.dispute.count({ where: { status: { not: "RESOLVED" } } }),
    db.review.count({ where: { status: "FLAGGED" } }),
    payableShops(),
  ]);
  const fmt = (n: number) => formatMoney(n, locale);
  const todo = [
    { href: "/admin/shops?status=PENDING", text: t("pendingShops", { count: pendingShops }), n: pendingShops },
    { href: "/admin/products?status=PENDING_REVIEW", text: t("pendingProducts", { count: pendingProducts }), n: pendingProducts },
    { href: "/admin/disputes", text: t("openDisputes", { count: disputes }), n: disputes },
    { href: "/admin/reviews?status=FLAGGED", text: t("flaggedReviews", { count: flagged }), n: flagged },
    { href: "/admin/payouts", text: t("payable", { count: payable.length }), n: payable.length },
  ];

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <section className="space-y-3">
        <h2 className="font-semibold">{t("last30")}</h2>
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label={t("gmv")} value={fmt(summary.gmvMinor)} />
          <Stat label={t("commission")} value={fmt(summary.commissionMinor)} />
          <Stat label={t("orders")} value={summary.orders} />
          <Stat label={t("aov")} value={fmt(summary.averageOrderMinor)} />
        </dl>
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold">{t("todo")}</h2>
        <ul className="divide-y divide-border rounded-lg border border-border text-sm">
          {todo.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className={`flex items-center justify-between p-3 hover:bg-surface ${item.n ? "font-medium" : "text-muted"}`}>
                {item.text}
                {item.n > 0 && <span aria-hidden>→</span>}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

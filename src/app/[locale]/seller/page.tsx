import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Stat } from "@/components/seller/stat";
import { formatMoney } from "@/lib/money";
import { requireSeller } from "@/server/auth/guards";
import { db } from "@/server/db";
import { balances, salesSummary } from "@/server/seller/analytics";
import { getSellerSubOrders, sellerActionCounts } from "@/server/seller/orders";

export const metadata: Metadata = { robots: { index: false } };

const LOW_STOCK = 5;

export default async function SellerDashboardPage({ params }: PageProps<"/[locale]/seller">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { shop } = await requireSeller(locale);

  const [t, ordersT, subT, summary, money, counts, recent, lowStock] = await Promise.all([
    getTranslations("seller.dashboard"),
    getTranslations("seller.orders"),
    getTranslations("subOrderStatus"),
    salesSummary(shop.id, 30),
    balances(shop.id),
    sellerActionCounts(shop.id),
    getSellerSubOrders(shop.id, { page: 1, pageSize: 5 }),
    db.productVariant.findMany({
      where: { product: { shopId: shop.id, status: "ACTIVE" }, isActive: true, stock: { lte: LOW_STOCK } },
      orderBy: { stock: "asc" },
      take: 5,
      select: { id: true, stock: true, sku: true, attributes: true, product: { select: { id: true, title: true } } },
    }),
  ]);
  const fmt = (n: number) => formatMoney(n, locale);
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h1 className="text-2xl font-bold">{t("last30")}</h1>
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label={t("gross")} value={fmt(summary.grossMinor)} />
          <Stat label={t("net")} value={fmt(summary.netMinor)} />
          <Stat label={t("orders")} value={summary.orders} />
          <Stat label={t("units")} value={summary.units} />
        </dl>
        <dl className="grid gap-3 sm:grid-cols-3">
          <Stat label={t("held")} value={fmt(money.heldMinor)} hint={t("heldHint")} />
          <Stat label={t("available")} value={fmt(money.availableMinor)} />
          <Stat label={t("paidOut")} value={fmt(money.paidOutMinor)} />
        </dl>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-2">
          <h2 className="font-semibold">{t("attention")}</h2>
          <ul className="divide-y divide-border rounded-lg border border-border text-sm">
            <li>
              <Link href="/seller/orders?status=PAID" className="block p-3 hover:bg-surface">
                {t("toProcess", { count: counts.toProcess })}
              </Link>
            </li>
            <li>
              <Link href="/seller/orders?status=PROCESSING" className="block p-3 hover:bg-surface">
                {t("toShip", { count: counts.toShip })}
              </Link>
            </li>
            <li>
              <Link href="/seller/returns" className="block p-3 hover:bg-surface">
                {t("returnsOpen", { count: counts.returns })}
              </Link>
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="font-semibold">{t("lowStock")}</h2>
          {lowStock.length === 0 ? (
            <p className="text-sm text-muted">—</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border text-sm">
              {lowStock.map((v) => (
                <li key={v.id}>
                  <Link href={`/seller/products/${v.product.id}`} className="flex justify-between gap-3 p-3 hover:bg-surface">
                    <span className="truncate">
                      {v.product.title} {Object.values(v.attributes as Record<string, string>).join(" · ")}
                    </span>
                    <span className={v.stock === 0 ? "font-semibold text-danger" : "text-muted"}>{t("lowStockItem", { count: v.stock })}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">{t("recentOrders")}</h2>
          <Link href="/seller/orders" className="text-sm text-brand">
            {t("viewAll")}
          </Link>
        </div>
        {recent.subOrders.length === 0 ? (
          <p className="text-sm text-muted">{t("noOrders")}</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border text-sm">
            {recent.subOrders.map((s) => (
              <li key={s.id}>
                <Link href={`/seller/orders/${s.id}`} className="flex flex-wrap items-center justify-between gap-2 p-3 hover:bg-surface">
                  <span dir="ltr" className="font-medium">
                    {s.order.number}
                  </span>
                  <span className="text-muted">{s.order.paidAt ? dateFmt.format(s.order.paidAt) : ""}</span>
                  <span>{subT(s.status)}</span>
                  <span className="font-semibold">
                    {ordersT("colNet")}: {fmt(s.sellerNetMinor)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

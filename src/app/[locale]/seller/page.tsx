import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireSeller } from "@/server/auth/guards";
import { db } from "@/server/db";

export const metadata: Metadata = { robots: { index: false } };

export default async function SellerDashboardPage({ params }: PageProps<"/[locale]/seller">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { shop } = await requireSeller(locale);
  const t = await getTranslations("seller");
  const status = await getTranslations("shopStatus");

  const [productCount, orderCount] = await Promise.all([
    db.product.count({ where: { shopId: shop.id } }),
    db.subOrder.count({ where: { shopId: shop.id } }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      {shop.status === "PENDING" && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{t("pendingNotice")}</p>
      )}
      {shop.status === "SUSPENDED" && (
        <p className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{t("suspendedNotice")}</p>
      )}
      <dl className="grid gap-3 sm:grid-cols-4">
        <Stat label={t("shop")} value={shop.name} />
        <Stat label={t("status")} value={status(shop.status)} />
        <Stat label={t("products")} value={productCount} />
        <Stat label={t("orders")} value={orderCount} />
      </dl>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border p-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 text-lg font-semibold">{value}</dd>
    </div>
  );
}

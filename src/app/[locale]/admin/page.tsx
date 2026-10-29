import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireAdmin } from "@/server/auth/guards";
import { db } from "@/server/db";

export const metadata: Metadata = { robots: { index: false } };

export default async function AdminPage({ params }: PageProps<"/[locale]/admin">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin(locale);
  const t = await getTranslations("admin");

  const [users, shops, pendingShops, products, orders, settings] = await Promise.all([
    db.user.count(),
    db.shop.count(),
    db.shop.count({ where: { status: "PENDING" } }),
    db.product.count(),
    db.order.count(),
    db.platformSettings.findUnique({ where: { id: 1 } }),
  ]);

  const stats = [
    [t("users"), users],
    [t("shops"), shops],
    [t("pendingShops"), pendingShops],
    [t("products"), products],
    [t("orders"), orders],
    [t("commission"), `${(settings?.globalCommissionBps ?? 0) / 100}%`],
  ] as const;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-border p-4">
            <dt className="text-sm text-muted">{label}</dt>
            <dd className="mt-1 text-2xl font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

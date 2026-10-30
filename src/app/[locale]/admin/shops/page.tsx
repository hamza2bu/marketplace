import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { FilterBar, readListParams } from "@/components/admin/filter-bar";
import { Pagination } from "@/components/catalog/pagination";
import { requireAdmin } from "@/server/auth/guards";
import { listShops } from "@/server/admin/shops";
import type { ShopStatus } from "@/generated/prisma/enums";

export const metadata: Metadata = { robots: { index: false } };
const STATUSES: ShopStatus[] = ["PENDING", "APPROVED", "SUSPENDED", "REMOVED"];

export default async function AdminShopsPage({ params, searchParams }: PageProps<"/[locale]/admin/shops">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin(locale);
  const { status, q, page } = readListParams(await searchParams, STATUSES);
  const [t, common, statusT, catalogT, { shops, pageCount }] = await Promise.all([
    getTranslations("admin.shops"),
    getTranslations("admin.common"),
    getTranslations("shopStatus"),
    getTranslations("catalog"),
    listShops({ status, q, page }),
  ]);
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <FilterBar basePath="/admin/shops" locale={locale} tabs={STATUSES.map((s) => ({ value: s, label: statusT(s) }))} current={status} q={q} searchLabel={t("search")} allLabel={common("all")} />
      {shops.length === 0 ? (
        <p className="py-8 text-center text-muted">{common("none")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="border-b border-border text-muted">
                <th className="p-2 text-start font-medium">{t("title")}</th>
                <th className="p-2 text-start font-medium">{t("owner")}</th>
                <th className="p-2 text-start font-medium">{t("applied")}</th>
                <th className="p-2 text-start font-medium">{t("products")}</th>
                <th className="p-2 text-start font-medium">{t("orders")}</th>
                <th className="p-2 text-start font-medium">{t("commission")}</th>
                <th className="p-2 text-start font-medium">{common("status")}</th>
              </tr>
            </thead>
            <tbody>
              {shops.map((s) => (
                <tr key={s.id} className="border-b border-border hover:bg-surface">
                  <td className="p-2">
                    <Link href={`/admin/shops/${s.id}`} className="font-medium text-brand underline">
                      {s.name}
                    </Link>
                  </td>
                  <td className="p-2" dir="ltr">
                    {s.owner.email}
                  </td>
                  <td className="p-2">{dateFmt.format(s.createdAt)}</td>
                  <td className="p-2">{s._count.products}</td>
                  <td className="p-2">{s._count.subOrders}</td>
                  <td className="p-2">{s.commissionBpsOverride === null ? t("default") : `${s.commissionBpsOverride / 100}%`}</td>
                  <td className="p-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${s.status === "PENDING" ? "bg-amber-100 text-amber-900" : "bg-surface"}`}>{statusT(s.status)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination
        page={page}
        pageCount={pageCount}
        hrefFor={(p) => `/admin/shops?${new URLSearchParams({ ...(status ? { status } : {}), ...(q ? { q } : {}), page: String(p) })}`}
        labels={{ pagination: catalogT("pagination"), previous: catalogT("previous"), next: catalogT("next"), pageOf: catalogT("pageOf", { page, pageCount }) }}
      />
    </div>
  );
}

import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { FilterBar, readListParams } from "@/components/admin/filter-bar";
import { Pagination } from "@/components/catalog/pagination";
import { formatMoney } from "@/lib/money";
import { requireAdmin } from "@/server/auth/guards";
import { listOrdersForAdmin } from "@/server/admin/orders";
import type { OrderStatus } from "@/generated/prisma/enums";

export const metadata: Metadata = { robots: { index: false } };
const STATUSES: OrderStatus[] = ["PAID", "PARTIALLY_FULFILLED", "COMPLETED", "PENDING_PAYMENT", "PARTIALLY_REFUNDED", "REFUNDED", "CANCELLED"];

export default async function AdminOrdersPage({ params, searchParams }: PageProps<"/[locale]/admin/orders">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin(locale);
  const { status, q, page } = readListParams(await searchParams, STATUSES);
  const [t, common, statusT, catalogT, { orders, pageCount }] = await Promise.all([
    getTranslations("admin.orders"),
    getTranslations("admin.common"),
    getTranslations("orderStatus"),
    getTranslations("catalog"),
    listOrdersForAdmin({ status, q, page }),
  ]);
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <FilterBar basePath="/admin/orders" locale={locale} tabs={STATUSES.map((s) => ({ value: s, label: statusT(s) }))} current={status} q={q} searchLabel={t("search")} allLabel={common("all")} />
      {orders.length === 0 ? (
        <p className="py-8 text-center text-muted">{common("none")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="border-b border-border text-muted">
                <th className="p-2 text-start font-medium">#</th>
                <th className="p-2 text-start font-medium">{common("date")}</th>
                <th className="p-2 text-start font-medium">{t("customer")}</th>
                <th className="p-2 text-start font-medium">{t("shipments")}</th>
                <th className="p-2 text-start font-medium">{common("amount")}</th>
                <th className="p-2 text-start font-medium">{common("status")}</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const disputes = o.subOrders.reduce((n, s) => n + s._count.disputes, 0);
                return (
                  <tr key={o.id} className="border-b border-border hover:bg-surface">
                    <td className="p-2">
                      <Link href={`/admin/orders/${o.number}`} dir="ltr" className="font-medium text-brand underline">
                        {o.number}
                      </Link>
                      {disputes > 0 && <span className="ms-2 rounded bg-danger px-1 text-xs text-white">{t("dispute")}</span>}
                    </td>
                    <td className="p-2">{dateFmt.format(o.createdAt)}</td>
                    <td className="p-2" dir="ltr">
                      {o.customer.email}
                    </td>
                    <td className="p-2">{o._count.subOrders}</td>
                    <td className="p-2">{formatMoney(o.totalMinor, locale)}</td>
                    <td className="p-2">{statusT(o.status)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pagination
        page={page}
        pageCount={pageCount}
        hrefFor={(n) => `/admin/orders?${new URLSearchParams({ ...(status ? { status } : {}), ...(q ? { q } : {}), page: String(n) })}`}
        labels={{ pagination: catalogT("pagination"), previous: catalogT("previous"), next: catalogT("next"), pageOf: catalogT("pageOf", { page, pageCount }) }}
      />
    </div>
  );
}

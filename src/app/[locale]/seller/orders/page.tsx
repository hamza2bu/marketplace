import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Pagination } from "@/components/catalog/pagination";
import { formatMoney } from "@/lib/money";
import { requireSeller } from "@/server/auth/guards";
import { getSellerSubOrders } from "@/server/seller/orders";
import type { SubOrderStatus } from "@/generated/prisma/enums";

export const metadata: Metadata = { robots: { index: false } };

const FILTERS: SubOrderStatus[] = ["PAID", "PROCESSING", "SHIPPED", "DELIVERED", "RETURN_REQUESTED", "RETURNED", "CANCELLED", "REFUNDED"];

export default async function SellerOrdersPage({ params, searchParams }: PageProps<"/[locale]/seller/orders">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { shop } = await requireSeller(locale);
  const sp = await searchParams;
  const status = FILTERS.find((s) => s === sp.status);
  const pageNum = Number(sp.page);
  const page = Number.isInteger(pageNum) && pageNum > 0 ? pageNum : 1;
  const [t, subT, catalogT, { subOrders, pageCount }] = await Promise.all([
    getTranslations("seller.orders"),
    getTranslations("subOrderStatus"),
    getTranslations("catalog"),
    getSellerSubOrders(shop.id, { status, page }),
  ]);
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  const tab = (s?: SubOrderStatus) =>
    `rounded-full px-3 py-1 text-sm whitespace-nowrap ${s === status ? "bg-brand text-brand-foreground" : "bg-surface hover:bg-border"}`;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <nav className="flex gap-2 overflow-x-auto pb-1">
        <Link href="/seller/orders" className={tab(undefined)}>
          {t("all")}
        </Link>
        {FILTERS.map((s) => (
          <Link key={s} href={`/seller/orders?status=${s}`} className={tab(s)}>
            {subT(s)}
          </Link>
        ))}
      </nav>
      {subOrders.length === 0 ? (
        <p className="py-8 text-center text-muted">{t("empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="border-b border-border text-muted">
                <th className="p-2 text-start font-medium">{t("colOrder")}</th>
                <th className="p-2 text-start font-medium">{t("colDate")}</th>
                <th className="p-2 text-start font-medium">{t("colCustomer")}</th>
                <th className="p-2 text-start font-medium">{t("colTotal")}</th>
                <th className="p-2 text-start font-medium">{t("colNet")}</th>
                <th className="p-2 text-start font-medium">{t("colStatus")}</th>
              </tr>
            </thead>
            <tbody>
              {subOrders.map((s) => (
                <tr key={s.id} className="border-b border-border hover:bg-surface">
                  <td className="p-2">
                    <Link href={`/seller/orders/${s.id}`} dir="ltr" className="font-medium text-brand underline">
                      {s.order.number}
                    </Link>
                  </td>
                  <td className="p-2">{s.order.paidAt ? dateFmt.format(s.order.paidAt) : ""}</td>
                  <td className="p-2">{(s.order.shippingAddress as { fullName?: string }).fullName}</td>
                  <td className="p-2">{formatMoney(s.subtotalMinor + s.shippingMinor, locale)}</td>
                  <td className="p-2 font-semibold">{formatMoney(s.sellerNetMinor, locale)}</td>
                  <td className="p-2">{subT(s.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination
        page={page}
        pageCount={pageCount}
        hrefFor={(p) => `/seller/orders?${new URLSearchParams({ ...(status ? { status } : {}), ...(p > 1 ? { page: String(p) } : {}) })}`}
        labels={{ pagination: catalogT("pagination"), previous: catalogT("previous"), next: catalogT("next"), pageOf: catalogT("pageOf", { page, pageCount }) }}
      />
    </div>
  );
}

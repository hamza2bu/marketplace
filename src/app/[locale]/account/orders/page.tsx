import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Pagination } from "@/components/catalog/pagination";
import { ProductImage } from "@/components/catalog/product-image";
import { formatMoney } from "@/lib/money";
import { requireUser } from "@/server/auth/guards";
import { getCustomerOrders } from "@/server/orders";

export const metadata: Metadata = { robots: { index: false } };

export default async function OrdersPage({ params, searchParams }: PageProps<"/[locale]/account/orders">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale, `/${locale}/account/orders`);
  const pageParam = Number((await searchParams).page);
  const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;
  const [t, statusT, catalogT, { orders, pageCount }] = await Promise.all([
    getTranslations("orders"),
    getTranslations("orderStatus"),
    getTranslations("catalog"),
    getCustomerOrders(user.id, page),
  ]);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      {orders.length === 0 ? (
        <p className="text-muted">{t("empty")}</p>
      ) : (
        <ul className="space-y-3">
          {orders.map((order) => (
            <li key={order.id}>
              <Link
                href={`/account/orders/${order.number}`}
                className="flex flex-wrap items-center gap-4 rounded-lg border border-border p-4 hover:border-foreground"
              >
                <div className="flex -space-x-3 rtl:space-x-reverse">
                  {order.subOrders
                    .flatMap((s) => s.items)
                    .slice(0, 3)
                    .map((item, i) =>
                      item.imageSnapshot ? (
                        <div key={i} className="relative size-12 overflow-hidden rounded-md border-2 border-background bg-surface">
                          <ProductImage src={item.imageSnapshot} alt="" fill sizes="48px" className="object-cover" />
                        </div>
                      ) : null,
                    )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium" dir="ltr">
                    {order.number}
                  </p>
                  <p className="text-sm text-muted">{t("placedOn", { date: date.format(order.createdAt) })}</p>
                </div>
                <span className="rounded-full bg-surface px-3 py-1 text-sm">{statusT(order.status)}</span>
                <span className="font-semibold">{formatMoney(order.totalMinor, locale)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Pagination
        page={page}
        pageCount={pageCount}
        hrefFor={(p) => `/account/orders${p > 1 ? `?page=${p}` : ""}`}
        labels={{
          pagination: catalogT("pagination"),
          previous: catalogT("previous"),
          next: catalogT("next"),
          pageOf: catalogT("pageOf", { page, pageCount }),
        }}
      />
    </div>
  );
}

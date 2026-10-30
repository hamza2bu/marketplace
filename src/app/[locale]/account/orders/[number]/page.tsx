import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ProductImage } from "@/components/catalog/product-image";
import { formatMoney } from "@/lib/money";
import { requireUser } from "@/server/auth/guards";
import { getCustomerOrder } from "@/server/orders";
import { isTestProviderEnabled } from "@/server/payments";
import { TEST_PROVIDER_ID } from "@/server/payments/providers/test-provider";
import { CancelPendingOrderButton, CancelSubOrderButton, ReportProblemForm, ReturnRequestForm } from "../order-actions";
import { DisputeThread } from "@/components/admin/dispute-thread";

export const metadata: Metadata = { robots: { index: false } };

type Address = { fullName: string; phone: string; line1: string; line2?: string | null; city: string; postalCode: string };

export default async function OrderDetailPage({ params }: PageProps<"/[locale]/account/orders/[number]">) {
  const { locale, number } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale, `/${locale}/account/orders/${number}`);
  const order = await getCustomerOrder(user.id, number);
  if (!order) notFound();

  const [t, statusT, subT, returnT, cartT, disputeT] = await Promise.all([
    getTranslations("orders"),
    getTranslations("orderStatus"),
    getTranslations("subOrderStatus"),
    getTranslations("returnStatus"),
    getTranslations("cart"),
    getTranslations("admin.disputes"),
  ]);
  const money = (n: number) => formatMoney(n, locale);
  const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const dateOnly = new Intl.DateTimeFormat(locale, { dateStyle: "long" });
  const address = order.shippingAddress as Address;
  const refundedTotal = order.subOrders.flatMap((s) => s.refunds).reduce((n, r) => n + r.amountMinor, 0);
  const canPayTestOrder = order.status === "PENDING_PAYMENT" && order.paymentProvider === TEST_PROVIDER_ID && order.paymentRef && isTestProviderEnabled();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" dir="ltr">
            {t("number", { number: order.number })}
          </h1>
          <p className="text-sm text-muted">{t("placedOn", { date: dateTime.format(order.createdAt) })}</p>
        </div>
        <span className="rounded-full bg-surface px-3 py-1 text-sm font-medium">{statusT(order.status)}</span>
      </div>

      {order.status === "PENDING_PAYMENT" && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900">
          {canPayTestOrder && (
            <Link href={`/pay/test/${order.paymentRef}`} className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-brand-foreground">
              {t("payNow")}
            </Link>
          )}
          <CancelPendingOrderButton orderId={order.id} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="space-y-4">
          {order.subOrders.map((sub) => {
            const lastReturn = sub.returnRequests[0];
            const { until: returnUntil, canReturn } = sub.returns;
            return (
              <section key={sub.id} className="rounded-lg border border-border">
                <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface px-4 py-2 text-sm">
                  <Link href={`/s/${sub.shop.slug}`} className="font-medium hover:text-brand">
                    {t("shipment", { shop: sub.shop.name })}
                  </Link>
                  <span className="font-medium">{subT(sub.status)}</span>
                </header>

                <ul className="divide-y divide-border">
                  {sub.items.map((item) => (
                    <li key={item.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                      <div className="relative size-14 shrink-0 overflow-hidden rounded bg-surface">
                        {item.imageSnapshot && <ProductImage src={item.imageSnapshot} alt="" fill sizes="56px" className="object-cover" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{item.titleSnapshot}</p>
                        <p className="text-muted">
                          {Object.values(item.attributes as Record<string, string>).join(" · ")} × {item.quantity}
                        </p>
                      </div>
                      <p>{money(item.lineTotalMinor)}</p>
                    </li>
                  ))}
                </ul>

                <div className="space-y-3 border-t border-border px-4 py-3 text-sm">
                  {sub.trackingNumber && (
                    <p>
                      {t("tracking", { carrier: sub.carrier ?? "", number: sub.trackingNumber })}
                    </p>
                  )}
                  <div>
                    <p className="mb-1 font-medium">{t("timeline")}</p>
                    <ol className="space-y-1 border-s-2 border-border ps-3">
                      {sub.events.map((e) => (
                        <li key={e.id} className="text-muted">
                          <span className="text-foreground">{subT(e.status)}</span> · {dateTime.format(e.createdAt)}
                        </li>
                      ))}
                    </ol>
                  </div>
                  {lastReturn && <p>{t("returnStatus", { status: returnT(lastReturn.status) })}</p>}
                  {sub.disputes.map((d) => (
                    <div key={d.id} className="space-y-2 rounded-md border border-border p-3">
                      <p className="font-medium">{t("disputeTitle", { status: disputeT(`status.${d.status}`) })}</p>
                      <DisputeThread messages={d.messages} locale={locale} />
                    </div>
                  ))}
                  {order.paidAt && !sub.disputes.some((d) => d.status !== "RESOLVED") && <ReportProblemForm subOrderId={sub.id} />}
                  {sub.status === "PAID" && <CancelSubOrderButton subOrderId={sub.id} />}
                  {canReturn && (
                    <div className="space-y-2">
                      <p className="text-muted">{t("returnWindow", { date: dateOnly.format(returnUntil!) })}</p>
                      <ReturnRequestForm subOrderId={sub.id} />
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>

        <aside className="h-fit space-y-4 rounded-lg border border-border p-4 text-sm">
          <div>
            <h2 className="mb-1 font-semibold">{t("shipTo")}</h2>
            <p>{address.fullName}</p>
            <p>
              {address.line1}
              {address.line2 ? `, ${address.line2}` : ""}
            </p>
            <p>
              {address.city} {address.postalCode}
            </p>
            <p dir="ltr" className="text-start text-muted">
              {address.phone}
            </p>
          </div>
          <div>
            <h2 className="mb-1 font-semibold">{t("payment")}</h2>
            {order.paidAt && <p className="text-muted">{t("paidOn", { date: dateTime.format(order.paidAt) })}</p>}
            <dl className="mt-2 space-y-1">
              <div className="flex justify-between">
                <dt>{t("itemsSubtotal")}</dt>
                <dd>{money(order.subtotalMinor)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>{cartT("shipping")}</dt>
                <dd>{order.shippingMinor === 0 ? cartT("free") : money(order.shippingMinor)}</dd>
              </div>
              <div className="flex justify-between border-t border-border pt-1 font-semibold">
                <dt>{t("total")}</dt>
                <dd>{money(order.totalMinor)}</dd>
              </div>
              {refundedTotal > 0 && (
                <div className="flex justify-between text-brand">
                  <dt>{t("refunded")}</dt>
                  <dd>−{money(refundedTotal)}</dd>
                </div>
              )}
            </dl>
            <p className="mt-1 text-xs text-muted">{cartT("vatIncluded", { amount: money(order.vatMinor) })}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

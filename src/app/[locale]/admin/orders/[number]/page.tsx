import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ActionForm } from "@/components/admin/action-form";
import { DisputeThread } from "@/components/admin/dispute-thread";
import { formatMoney } from "@/lib/money";
import { requireAdmin } from "@/server/auth/guards";
import { getOrderForAdmin } from "@/server/admin/orders";
import { refundAction } from "../../actions";

export const metadata: Metadata = { robots: { index: false } };
const input = "w-full rounded-md border border-border bg-background px-2 py-1.5 text-base";

export default async function AdminOrderPage({ params }: PageProps<"/[locale]/admin/orders/[number]">) {
  const { locale, number } = await params;
  setRequestLocale(locale);
  await requireAdmin(locale);
  const order = await getOrderForAdmin(number);
  if (!order) notFound();
  const [t, common, statusT, subT, disputeT, transferT, sellerOrders] = await Promise.all([
    getTranslations("admin.orders"),
    getTranslations("admin.common"),
    getTranslations("orderStatus"),
    getTranslations("subOrderStatus"),
    getTranslations("admin.disputes"),
    getTranslations("seller.transferStatus"),
    getTranslations("seller.orders"),
  ]);
  const money = (n: number) => formatMoney(n, locale);
  const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" });
  const address = order.shippingAddress as { fullName?: string; line1?: string; city?: string; phone?: string };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" dir="ltr">
            {order.number}
          </h1>
          <p className="text-sm text-muted">
            <span dir="ltr">{order.customer.email}</span> · {dateTime.format(order.createdAt)} · {address.fullName}, {address.line1}, {address.city}
          </p>
        </div>
        <span className="rounded-full bg-surface px-3 py-1 text-sm font-medium">{statusT(order.status)}</span>
      </div>

      {order.subOrders.map((sub) => {
        const refunded = order.refunds.filter((r) => r.subOrderId === sub.id && r.status === "SUCCEEDED").reduce((n, r) => n + r.amountMinor, 0);
        const left = sub.subtotalMinor + sub.shippingMinor - refunded;
        return (
          <section key={sub.id} className="space-y-3 rounded-lg border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link href={`/admin/shops/${sub.shop.id}`} className="font-semibold text-brand underline">
                {sub.shop.name}
              </Link>
              <span className="text-sm">
                {subT(sub.status)} · <span className="text-muted">{transferT(sub.transferStatus)}</span>
              </span>
            </div>
            <ul className="text-sm">
              {sub.items.map((i) => (
                <li key={i.id} className="flex justify-between gap-3">
                  <span>
                    {i.titleSnapshot} × {i.quantity} <span className="text-muted">({i.commissionBps / 100}%)</span>
                  </span>
                  <span>{money(i.lineTotalMinor)}</span>
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted">
              {sellerOrders("shipping")}: {money(sub.shippingMinor)} · {sellerOrders("commission")}: {money(sub.commissionMinor)} · {sellerOrders("net")}: {money(sub.sellerNetMinor)}
              {refunded > 0 && <span className="text-danger"> · {sellerOrders("refunded")}: {money(refunded)}</span>}
              {sub.trackingNumber && <span dir="ltr"> · {sub.carrier} {sub.trackingNumber}</span>}
            </p>
            {sub.disputes.map((d) => (
              <div key={d.id} className="space-y-2 rounded-md border border-danger/30 p-3">
                <p className="text-sm font-medium">
                  {t("dispute")}: {disputeT(`status.${d.status}`)}{" "}
                  <Link href="/admin/disputes" className="text-brand underline">
                    {common("view")}
                  </Link>
                </p>
                <DisputeThread messages={d.messages} locale={locale} />
              </div>
            ))}
            {order.paidAt && left > 0 && (
              <details className="rounded-md bg-surface p-3">
                <summary className="cursor-pointer text-sm font-medium">{t("refund")}</summary>
                <ActionForm action={refundAction} errors="admin.orders.errors" success={common("saved")} confirm={common("confirm")} className="mt-3 grid gap-2 sm:grid-cols-2">
                  <input type="hidden" name="subOrderId" value={sub.id} />
                  <label className="text-sm">
                    <span className="mb-1 block">{t("refundAmount", { max: money(left) })}</span>
                    <input name="amount" inputMode="decimal" dir="ltr" className={input} />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block">{common("reason")}</span>
                    <input name="reason" required minLength={3} className={input} />
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="restock" className="size-4 accent-brand" />
                    {t("restock")}
                  </label>
                  {(sub.status === "PAID" || sub.status === "PROCESSING") && (
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="cancel" className="size-4 accent-brand" />
                      {t("cancelToo")}
                    </label>
                  )}
                  <div className="sm:col-span-2">
                    <button className="rounded-md bg-danger px-4 py-2 text-sm font-semibold text-white">{t("refund")}</button>
                  </div>
                </ActionForm>
              </details>
            )}
          </section>
        );
      })}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-2">
          <h2 className="font-semibold">{t("payment")}</h2>
          <ul className="text-sm">
            {order.paymentEvents.map((e) => (
              <li key={e.id} className="text-muted">
                {dateTime.format(e.receivedAt)} · <span className="text-foreground">{e.type}</span> · {e.amountMinor !== null ? money(e.amountMinor) : ""}
              </li>
            ))}
          </ul>
          <p className="text-sm font-semibold">
            {common("amount")}: {money(order.totalMinor)}
          </p>
        </section>
        <section className="space-y-2">
          <h2 className="font-semibold">{t("refunds")}</h2>
          {order.refunds.length === 0 ? (
            <p className="text-sm text-muted">{t("noRefunds")}</p>
          ) : (
            <ul className="text-sm">
              {order.refunds.map((r) => (
                <li key={r.id} className="text-muted">
                  {dateTime.format(r.createdAt)} · <span className="text-foreground">{money(r.amountMinor)}</span> · {r.status} · {r.reason} · {r.initiatedBy.email}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

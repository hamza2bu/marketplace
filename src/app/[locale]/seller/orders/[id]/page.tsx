import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ProductImage } from "@/components/catalog/product-image";
import { formatMoney } from "@/lib/money";
import { requireSeller } from "@/server/auth/guards";
import { getSellerSubOrder } from "@/server/seller/orders";
import { AdvanceForm, SellerCancelForm } from "../order-actions";

export const metadata: Metadata = { robots: { index: false } };

type Address = { fullName: string; phone: string; line1: string; line2?: string | null; city: string; postalCode: string };

export default async function SellerOrderPage({ params }: PageProps<"/[locale]/seller/orders/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const { shop } = await requireSeller(locale);
  const sub = await getSellerSubOrder(shop.id, id);
  if (!sub) notFound();

  const [t, subT, transferT, carriersT, returnT] = await Promise.all([
    getTranslations("seller.orders"),
    getTranslations("subOrderStatus"),
    getTranslations("seller.transferStatus"),
    getTranslations("seller.carriers"),
    getTranslations("returnStatus"),
  ]);
  const money = (n: number) => formatMoney(n, locale);
  const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jerusalem" });
  const address = sub.order.shippingAddress as Address;
  const refunded = sub.refunds.reduce((n, r) => n + r.amountMinor, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold" dir="ltr">
          {sub.order.number}
        </h1>
        <span className="rounded-full bg-surface px-3 py-1 text-sm font-medium">{subT(sub.status)}</span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="space-y-6">
          <section className="space-y-2">
            <h2 className="font-semibold">{t("items")}</h2>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {sub.items.map((item) => (
                <li key={item.id} className="flex items-center gap-3 p-3 text-sm">
                  <div className="relative size-14 shrink-0 overflow-hidden rounded bg-surface">
                    {item.imageSnapshot && <ProductImage src={item.imageSnapshot} alt="" fill sizes="56px" className="object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{item.titleSnapshot}</p>
                    <p className="text-muted">
                      <span dir="ltr">{item.skuSnapshot}</span> · {Object.values(item.attributes as Record<string, string>).join(" · ")} × {item.quantity}
                    </p>
                  </div>
                  <span>{money(item.lineTotalMinor)}</span>
                </li>
              ))}
            </ul>
          </section>

          {(sub.status === "PAID" || sub.status === "PROCESSING" || sub.status === "SHIPPED") && (
            <section className="space-y-3 rounded-lg border border-brand/40 p-4">
              <h2 className="font-semibold">{t("next")}</h2>
              <AdvanceForm subOrderId={sub.id} status={sub.status} />
              {(sub.status === "PAID" || sub.status === "PROCESSING") && <SellerCancelForm subOrderId={sub.id} />}
            </section>
          )}
          {sub.status === "DELIVERED" && sub.releaseAt && (
            <p className="rounded-md bg-surface p-3 text-sm">{t("deliveredNote", { date: dateTime.format(sub.releaseAt) })}</p>
          )}
          {sub.returnRequests[0] && (
            <p className="rounded-md bg-surface p-3 text-sm">
              {returnT(sub.returnRequests[0].status)}: {sub.returnRequests[0].reason}
            </p>
          )}

          <section className="space-y-2">
            <h2 className="font-semibold">{t("timeline")}</h2>
            <ol className="space-y-1 border-s-2 border-border ps-3 text-sm">
              {sub.events.map((e) => (
                <li key={e.id} className="text-muted">
                  <span className="text-foreground">{subT(e.status)}</span> · {dateTime.format(e.createdAt)}
                  {e.note && e.status === "SHIPPED" && ` · ${e.note.replace(/^[a-z-]+/, (c) => carriersT.has(c) ? carriersT(c as "other") : c)}`}
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="h-fit space-y-5 rounded-lg border border-border p-4 text-sm">
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
            <p dir="ltr" className="text-start">
              {address.phone}
            </p>
            {sub.trackingNumber && (
              <p className="mt-2 text-muted">
                {sub.carrier ? carriersT(sub.carrier as "other") : ""} · <span dir="ltr">{sub.trackingNumber}</span>
              </p>
            )}
          </div>
          <div>
            <h2 className="mb-1 font-semibold">{t("money")}</h2>
            <dl className="space-y-1">
              <div className="flex justify-between">
                <dt>{t("subtotal")}</dt>
                <dd>{money(sub.subtotalMinor)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>{t("shipping")}</dt>
                <dd>{money(sub.shippingMinor)}</dd>
              </div>
              <div className="flex justify-between text-muted">
                <dt>{t("commission")}</dt>
                <dd>−{money(sub.commissionMinor)}</dd>
              </div>
              <div className="flex justify-between border-t border-border pt-1 font-semibold">
                <dt>{t("net")}</dt>
                <dd>{money(sub.sellerNetMinor)}</dd>
              </div>
              {refunded > 0 && (
                <div className="flex justify-between text-danger">
                  <dt>{t("refunded")}</dt>
                  <dd>−{money(refunded)}</dd>
                </div>
              )}
            </dl>
            <p className="mt-2 text-xs text-muted">
              {t("transfer")}: {transferT(sub.transferStatus)}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

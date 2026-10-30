import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { formatMoney } from "@/lib/money";
import { requireSeller } from "@/server/auth/guards";
import { getSellerReturns } from "@/server/seller/orders";
import { ReturnDecision } from "../orders/order-actions";

export const metadata: Metadata = { robots: { index: false } };

export default async function SellerReturnsPage({ params }: PageProps<"/[locale]/seller/returns">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { shop } = await requireSeller(locale);
  const [t, statusT, returns] = await Promise.all([getTranslations("seller.returns"), getTranslations("returnStatus"), getSellerReturns(shop.id)]);
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      {returns.length === 0 ? (
        <p className="py-8 text-center text-muted">{t("empty")}</p>
      ) : (
        <ul className="space-y-3">
          {returns.map((r) => {
            const refundable =
              r.subOrder.subtotalMinor + r.subOrder.shippingMinor - r.subOrder.refunds.reduce((n, x) => n + x.amountMinor, 0);
            return (
              <li key={r.id} className="space-y-3 rounded-lg border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/seller/orders/${r.subOrder.id}`} dir="ltr" className="font-medium text-brand underline">
                    {r.subOrder.order.number}
                  </Link>
                  <span className="rounded-full bg-surface px-2 py-0.5 text-xs">{statusT(r.status)}</span>
                </div>
                <p className="text-xs text-muted">{t("requestedOn", { date: dateFmt.format(r.createdAt) })}</p>
                <div className="text-sm">
                  <p className="font-medium">{t("reason")}</p>
                  <p>{r.reason}</p>
                </div>
                {r.sellerNote && <p className="text-sm text-muted">{t("sellerNote", { note: r.sellerNote })}</p>}
                <ReturnDecision returnId={r.id} status={r.status} maxLabel={formatMoney(refundable, locale)} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

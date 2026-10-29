import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocalDateTimeInput } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { requireSeller } from "@/server/auth/guards";
import { db } from "@/server/db";
import { getShopDiscounts } from "@/server/seller/products";
import { endDiscountAction } from "./actions";
import { DiscountForm } from "./discount-form";

export const metadata: Metadata = { robots: { index: false } };

export default async function DiscountsPage({ params }: PageProps<"/[locale]/seller/discounts">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { shop } = await requireSeller(locale);
  const [t, discounts, products] = await Promise.all([
    getTranslations("seller.discounts"),
    getShopDiscounts(shop.id),
    db.product.findMany({ where: { shopId: shop.id, status: { not: "ARCHIVED" } }, select: { id: true, title: true }, orderBy: { title: "asc" } }),
  ]);
  const now = new Date();
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jerusalem" });
  const stateOf = (d: (typeof discounts)[number]) =>
    !d.isActive ? "stopped" : d.endsAt <= now ? "ended" : d.startsAt > now ? "scheduled" : "live";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted">{t("intro")}</p>
      </div>
      <DiscountForm
        products={products}
        defaults={{ startsAt: toLocalDateTimeInput(now), endsAt: toLocalDateTimeInput(new Date(now.getTime() + 7 * 86_400_000)) }}
      />
      {discounts.length === 0 ? (
        <p className="text-muted">{t("empty")}</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border text-sm">
          {discounts.map((d) => {
            const state = stateOf(d);
            return (
              <li key={d.id} className="flex flex-wrap items-center gap-3 p-3">
                <span className="text-lg font-semibold">{d.type === "PERCENT" ? `−${d.value / 100}%` : `−${formatMoney(d.value, locale)}`}</span>
                <span className="min-w-0 flex-1 truncate">{d.product?.title ?? t("wholeShop")}</span>
                <span className="text-muted">
                  {dateFmt.format(d.startsAt)} – {dateFmt.format(d.endsAt)}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${state === "live" ? "bg-brand/10 text-brand" : "bg-surface"}`}>{t(`state.${state}`)}</span>
                {(state === "live" || state === "scheduled") && (
                  <form action={endDiscountAction}>
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="discountId" value={d.id} />
                    <button className="text-danger underline">{t("end")}</button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

import type { Metadata } from "next";
import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AddressForm } from "@/components/account/address-form";
import { ProductImage } from "@/components/catalog/product-image";
import { formatMoney } from "@/lib/money";
import { requireUser } from "@/server/auth/guards";
import { getCartView } from "@/server/cart";
import { db } from "@/server/db";
import { getPlatformSettings } from "@/server/settings";
import { PlaceOrderForm } from "./place-order-form";

export async function generateMetadata({ params }: PageProps<"/[locale]/checkout">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "checkout" });
  return { title: t("title"), robots: { index: false } };
}

export default async function CheckoutPage({ params }: PageProps<"/[locale]/checkout">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale, `/${locale}/checkout`);
  const [t, cartT, cart, addresses, settings] = await Promise.all([
    getTranslations("checkout"),
    getTranslations("cart"),
    getCartView(),
    db.address.findMany({ where: { userId: user.id }, orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }] }),
    getPlatformSettings(),
  ]);
  if (cart.groups.length === 0 || cart.hasIssues) redirect(`/${locale}/cart`);
  const money = (n: number) => formatMoney(n, locale);
  // Single-use token so a double submit can't create two orders.
  const checkoutToken = randomBytes(18).toString("base64url");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <div className="grid gap-8 lg:grid-cols-[1fr_24rem]">
        <div className="space-y-8">
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">{t("review")}</h2>
            {cart.groups.map((group, i) => (
              <div key={group.shop.id} className="rounded-lg border border-border">
                <p className="border-b border-border bg-surface px-4 py-2 text-sm font-medium">
                  {t("shipment", { n: i + 1, count: cart.groups.length, shop: group.shop.name })}
                </p>
                <ul className="divide-y divide-border">
                  {group.lines.map((line) => (
                    <li key={line.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                      <div className="relative size-12 shrink-0 overflow-hidden rounded bg-surface">
                        {line.imageUrl && <ProductImage src={line.imageUrl} alt="" fill sizes="48px" className="object-cover" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate">{line.title}</p>
                        <p className="text-muted">
                          {Object.values(line.attributes).join(" · ")} {Object.keys(line.attributes).length ? "· " : ""}× {line.quantity}
                        </p>
                      </div>
                      <p className="font-medium">{money(line.lineTotalMinor)}</p>
                    </li>
                  ))}
                </ul>
                <p className="flex justify-between border-t border-border px-4 py-2 text-sm text-muted">
                  <span>{cartT("shipping")}</span>
                  <span>{group.shippingMinor === 0 ? cartT("free") : money(group.shippingMinor)}</span>
                </p>
              </div>
            ))}
          </section>
        </div>

        <aside className="h-fit space-y-6 rounded-lg border border-border p-4">
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">{t("shippingAddress")}</h2>
            {addresses.length === 0 && <p className="text-sm text-muted">{t("noAddresses")}</p>}
            <PlaceOrderForm
              addresses={addresses}
              checkoutToken={checkoutToken}
              submitLabel={t("placeOrder", { amount: money(cart.totalMinor) })}
            />
            <dl className="space-y-1 border-t border-border pt-3 text-sm">
              <div className="flex justify-between">
                <dt>{cartT("subtotal")}</dt>
                <dd>{money(cart.subtotalMinor)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>{cartT("shipping")}</dt>
                <dd>{cart.shippingMinor === 0 ? cartT("free") : money(cart.shippingMinor)}</dd>
              </div>
              <div className="flex justify-between font-semibold">
                <dt>{cartT("total")}</dt>
                <dd>{money(cart.totalMinor)}</dd>
              </div>
            </dl>
            <p className="text-xs text-muted">{cartT("vatIncluded", { amount: money(cart.vatMinor) })}</p>
            <p className="text-xs text-muted">{t("secureNote")}</p>
            <p className="text-xs text-muted">{t("holdNote", { minutes: settings.paymentWindowMinutes })}</p>
          </section>
          <details className="rounded-md border border-border p-3" open={addresses.length === 0}>
            <summary className="cursor-pointer text-sm font-medium">{t("addAddress")}</summary>
            <div className="mt-4">
              <AddressForm submitLabel={t("saveAddress")} />
            </div>
          </details>
        </aside>
      </div>
    </div>
  );
}

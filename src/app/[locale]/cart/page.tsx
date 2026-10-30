import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ProductImage } from "@/components/catalog/product-image";
import { Price } from "@/components/catalog/price";
import { formatMoney } from "@/lib/money";
import { getCartView, MAX_LINE_QUANTITY, type CartLine } from "@/server/cart";
import { updateCartItemAction } from "./actions";
import { QuantitySelect } from "./quantity-select";

export async function generateMetadata({ params }: PageProps<"/[locale]/cart">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "cart" });
  return { title: t("title"), robots: { index: false } };
}

export default async function CartPage({ params }: PageProps<"/[locale]/cart">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, cart] = await Promise.all([getTranslations("cart"), getCartView()]);
  const money = (n: number) => formatMoney(n, locale);

  if (cart.groups.length === 0) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-16 text-center">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted">{t("empty")}</p>
        <Link href="/" className="inline-block rounded-md bg-brand px-4 py-2 font-medium text-brand-foreground">
          {t("continueShopping")}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted">{t("oneCheckout")}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          {cart.groups.map((group) => (
            <section key={group.shop.id} className="rounded-lg border border-border">
              <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface px-4 py-2 text-sm">
                <Link href={`/s/${group.shop.slug}`} className="font-medium hover:text-brand">
                  {t("soldBy", { shop: group.shop.name })}
                </Link>
                <span className="text-muted">
                  {t("shipping")}: {group.shippingMinor === 0 ? t("free") : money(group.shippingMinor)}
                </span>
              </header>
              <ul className="divide-y divide-border">
                {group.lines.map((line) => (
                  <CartRow key={line.id} line={line} locale={locale} />
                ))}
              </ul>
              {group.shippingMinor > 0 && (
                <p className="border-t border-border px-4 py-2 text-xs text-muted">
                  {t("freeShippingHint", { amount: money(cart.freeShippingOverMinor) })}
                </p>
              )}
            </section>
          ))}
        </div>

        <aside className="h-fit space-y-3 rounded-lg border border-border p-4 lg:sticky lg:top-4">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt>{t("subtotal")}</dt>
              <dd>{money(cart.subtotalMinor)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>{t("shipping")}</dt>
              <dd>{cart.shippingMinor === 0 ? t("free") : money(cart.shippingMinor)}</dd>
            </div>
            <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
              <dt>{t("total")}</dt>
              <dd>{money(cart.totalMinor)}</dd>
            </div>
          </dl>
          <p className="text-xs text-muted">{t("vatIncluded", { amount: money(cart.vatMinor) })}</p>
          {cart.hasIssues ? (
            <p role="alert" className="rounded-md bg-danger/10 p-2 text-sm text-danger">
              {t("fixIssues")}
            </p>
          ) : (
            <Link
              href="/checkout"
              className="block rounded-md bg-brand px-4 py-3 text-center font-semibold text-brand-foreground"
            >
              {t("checkout")}
            </Link>
          )}
        </aside>
      </div>
    </div>
  );
}

async function CartRow({ line, locale }: { line: CartLine; locale: string }) {
  const t = await getTranslations("cart");
  const options = Object.values(line.attributes).join(" · ");
  return (
    <li className="flex gap-3 p-4">
      <Link href={`/p/${line.productSlug}`} className="relative size-20 shrink-0 overflow-hidden rounded-md bg-surface sm:size-24">
        {line.imageUrl && <ProductImage src={line.imageUrl} alt="" fill sizes="96px" className="object-cover" />}
      </Link>
      <div className="min-w-0 flex-1 space-y-1">
        <Link href={`/p/${line.productSlug}`} className="line-clamp-2 font-medium hover:text-brand">
          {line.title}
        </Link>
        {options && <p className="text-sm text-muted">{options}</p>}
        <Price amount={line.unitPriceMinor} compareAt={line.compareAtMinor} locale={locale} />
        {line.issue && (
          <p className="text-sm font-medium text-danger">
            {line.issue === "insufficient_stock" ? t("issue.insufficient_stock", { stock: line.stock }) : t(`issue.${line.issue}`)}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          {line.issue !== "unavailable" && line.issue !== "out_of_stock" && (
            <QuantitySelect
              itemId={line.id}
              quantity={line.quantity}
              max={Math.min(MAX_LINE_QUANTITY, Math.max(line.stock, line.quantity))}
              label={t("quantityFor", { title: line.title })}
            />
          )}
          <form action={updateCartItemAction}>
            <input type="hidden" name="itemId" value={line.id} />
            <input type="hidden" name="quantity" value="0" />
            <button type="submit" className="text-sm text-muted underline hover:text-danger">
              {t("remove")}
            </button>
          </form>
        </div>
      </div>
      <p className="shrink-0 font-semibold">{formatMoney(line.lineTotalMinor, locale)}</p>
    </li>
  );
}

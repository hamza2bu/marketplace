import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ProductGrid } from "@/components/catalog/product-card";
import { requireUser } from "@/server/auth/guards";
import { getProductCards } from "@/server/catalog";
import { savedProductIds } from "@/server/wishlist";

export const metadata: Metadata = { robots: { index: false } };

export default async function WishlistPage({ params }: PageProps<"/[locale]/account/wishlist">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale, `/${locale}/account/wishlist`);
  const [t, ids] = await Promise.all([getTranslations("wishlist"), savedProductIds(user.id)]);
  const products = await getProductCards(ids);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      {products.length === 0 ? <p className="text-muted">{t("empty")}</p> : <ProductGrid products={products} locale={locale} />}
    </div>
  );
}

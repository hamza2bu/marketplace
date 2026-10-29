import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ProductGrid } from "@/components/catalog/product-card";
import { ProductImage } from "@/components/catalog/product-image";
import { childrenOf } from "@/lib/category-tree";
import { localized } from "@/lib/i18n-text";
import { localeAlternates } from "@/lib/seo";
import { getCategories, getHomeData, type ProductCardData } from "@/server/catalog";

// Static page, rebuilt in the background at most every 5 minutes.
export const revalidate = 300;

export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  return { alternates: localeAlternates(locale, "") };
}

function Shelf({ title, href, viewAll, products, locale }: { title: string; href: string; viewAll: string; products: ProductCardData[]; locale: string }) {
  if (products.length === 0) return null;
  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-xl font-semibold sm:text-2xl">{title}</h2>
        <Link href={href} className="text-sm font-medium text-brand">
          {viewAll}
        </Link>
      </div>
      <ProductGrid products={products} locale={locale} />
    </section>
  );
}

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, categories, { banners, deals, featured, newest }] = await Promise.all([
    getTranslations("home"),
    getCategories(),
    getHomeData(),
  ]);
  const topCategories = childrenOf(categories, null);
  const [hero, ...moreBanners] = banners;

  return (
    <div className="space-y-12">
      <h1 className="sr-only">{t("heading")}</h1>

      {hero && (
        <section className="grid gap-3 md:grid-cols-[2fr_1fr]">
          {[hero, ...moreBanners.slice(0, 1)].map((banner, i) => (
            <Link
              key={banner.id}
              href={banner.linkUrl}
              className="group relative flex min-h-44 items-end overflow-hidden rounded-xl bg-surface p-5 sm:min-h-64 sm:p-8"
            >
              <ProductImage
                src={banner.imageUrl}
                alt=""
                fill
                priority={i === 0}
                sizes={i === 0 ? "(min-width: 768px) 66vw, 100vw" : "(min-width: 768px) 33vw, 100vw"}
                className="object-cover transition-transform group-hover:scale-[1.02]"
              />
              <div className="relative max-w-md rounded-lg bg-background/85 p-4 backdrop-blur">
                <p className={`font-bold ${i === 0 ? "text-2xl sm:text-3xl" : "text-xl"}`}>{localized(banner.title, locale)}</p>
                {banner.subtitle ? <p className="mt-1 text-sm text-muted">{localized(banner.subtitle, locale)}</p> : null}
                <span className="mt-3 inline-block text-sm font-semibold text-brand">{t("shopNow")} →</span>
              </div>
            </Link>
          ))}
        </section>
      )}

      <section className="space-y-4">
        <h2 className="text-xl font-semibold sm:text-2xl">{t("categories")}</h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {topCategories.map((c) => (
            <li key={c.id}>
              <Link href={`/c/${c.slug}`} className="group block overflow-hidden rounded-lg border border-border">
                <div className="relative aspect-[4/3] bg-surface">
                  {c.imageUrl && (
                    <ProductImage src={c.imageUrl} alt="" fill sizes="(min-width: 640px) 25vw, 50vw" className="object-cover" />
                  )}
                </div>
                <p className="p-3 text-center font-medium group-hover:text-brand">{localized(c.name, locale)}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <Shelf title={t("deals")} href="/deals" viewAll={t("viewAll")} products={deals} locale={locale} />
      <Shelf title={t("featured")} href="/search" viewAll={t("viewAll")} products={featured} locale={locale} />
      <Shelf title={t("newest")} href="/search?sort=newest" viewAll={t("viewAll")} products={newest} locale={locale} />
    </div>
  );
}

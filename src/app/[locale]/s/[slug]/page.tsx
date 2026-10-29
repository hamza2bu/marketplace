import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CatalogView } from "@/components/catalog/catalog-view";
import { ProductImage } from "@/components/catalog/product-image";
import { Stars } from "@/components/catalog/stars";
import { hasActiveFilters, parseCatalogQuery } from "@/lib/catalog-query";
import { localeAlternates, snippet } from "@/lib/seo";
import { getShopBySlug, searchCatalog } from "@/server/catalog";

export async function generateMetadata({ params, searchParams }: PageProps<"/[locale]/s/[slug]">): Promise<Metadata> {
  const { locale, slug } = await params;
  const shop = await getShopBySlug(slug);
  if (!shop) return {};
  const query = parseCatalogQuery(await searchParams);
  return {
    title: shop.name,
    description: shop.description ? snippet(shop.description) : undefined,
    alternates: localeAlternates(locale, `/s/${slug}`),
    robots: hasActiveFilters(query) || query.page > 1 ? { index: false, follow: true } : undefined,
  };
}

export default async function StorefrontPage({ params, searchParams }: PageProps<"/[locale]/s/[slug]">) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const shop = await getShopBySlug(slug);
  if (!shop) notFound();

  const query = parseCatalogQuery(await searchParams);
  const [t, result] = await Promise.all([getTranslations("product"), searchCatalog(query, { shopId: shop.id })]);
  const since = new Intl.DateTimeFormat(locale, { year: "numeric", month: "long" }).format(shop.createdAt);

  return (
    <CatalogView
      locale={locale}
      basePath={`/s/${slug}`}
      query={query}
      result={result}
      hide={{ shops: true }}
      heading={
        <header className="overflow-hidden rounded-lg border border-border">
          <div className="relative h-28 bg-surface sm:h-40">
            <ProductImage
              src={shop.bannerUrl ?? `/placeholder/${shop.slug}-banner.svg?w=1600&h=320`}
              alt=""
              fill
              priority
              sizes="100vw"
              className="object-cover"
            />
          </div>
          <div className="flex flex-wrap items-end gap-4 p-4">
            <div className="relative -mt-12 size-20 shrink-0 overflow-hidden rounded-full border-4 border-background bg-surface">
              <ProductImage src={shop.logoUrl ?? `/placeholder/${shop.slug}.svg?w=160&h=160`} alt="" fill sizes="80px" className="object-cover" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-bold">{shop.name}</h1>
              <p className="text-sm text-muted">
                {t("memberSince", { date: since })} · {t("shopProducts", { count: shop._count.products })}
              </p>
              {shop.ratingCount > 0 && (
                <Stars rating={shop.ratingAvg} label={t("starsOutOf", { rating: shop.ratingAvg.toFixed(1) })} />
              )}
            </div>
          </div>
          {shop.description && <p className="px-4 pb-4 text-sm">{shop.description}</p>}
        </header>
      }
    />
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Breadcrumbs } from "@/components/catalog/breadcrumbs";
import { ProductGrid } from "@/components/catalog/product-card";
import { ProductImage } from "@/components/catalog/product-image";
import { Stars } from "@/components/catalog/stars";
import { JsonLd } from "@/components/json-ld";
import { Gallery } from "@/components/product/gallery";
import { VariantPicker } from "@/components/product/variant-picker";
import { WishlistButton } from "@/components/product/wishlist-button";
import { ReportReview } from "@/components/reviews/report-review";
import { ancestry } from "@/lib/category-tree";
import { localized } from "@/lib/i18n-text";
import { localeAlternates, snippet } from "@/lib/seo";
import { absoluteUrl } from "@/lib/site";
import { getCategories, getProductBySlug, getRelatedProducts, type ProductDetail } from "@/server/catalog";

// Rendered on first request, then cached and refreshed every 5 minutes.
// Stock shown here can be slightly stale; it is re-checked at checkout.
export const revalidate = 300;

export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: PageProps<"/[locale]/p/[slug]">): Promise<Metadata> {
  const { locale, slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return {};
  const description = snippet(product.description);
  return {
    title: product.title,
    description,
    alternates: localeAlternates(locale, `/p/${slug}`),
    openGraph: {
      type: "website",
      title: product.title,
      description,
      images: product.images.slice(0, 1).map((i) => absoluteUrl(i.url)),
    },
  };
}

function productJsonLd(product: ProductDetail, locale: string) {
  const prices = product.variants.map((v) => v.priceMinor / 100);
  const inStock = product.variants.some((v) => v.stock > 0);
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description: product.description,
    sku: product.variants[0]?.sku,
    image: product.images.map((i) => absoluteUrl(i.url)),
    url: absoluteUrl(`/${locale}/p/${product.slug}`),
    ...(product.brand ? { brand: { "@type": "Brand", name: product.brand.name } } : {}),
    ...(product.ratingCount > 0
      ? { aggregateRating: { "@type": "AggregateRating", ratingValue: product.ratingAvg.toFixed(1), reviewCount: product.ratingCount } }
      : {}),
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "ILS",
      lowPrice: Math.min(...prices).toFixed(2),
      highPrice: Math.max(...prices).toFixed(2),
      offerCount: product.variants.length,
      availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      seller: { "@type": "Organization", name: product.shop.name },
    },
  };
}

export default async function ProductPage({ params }: PageProps<"/[locale]/p/[slug]">) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const [t, categories, related] = await Promise.all([
    getTranslations("product"),
    getCategories(),
    getRelatedProducts(product.id, product.categoryId),
  ]);
  const crumbs = ancestry(categories, product.categoryId).map((c) => ({
    label: localized(c.name, locale),
    href: `/c/${c.slug}`,
  }));
  const specs = Object.entries(product.specs);
  const totalRatings = product.ratingDistribution.reduce((n, r) => n + r.count, 0);
  const dateFormat = new Intl.DateTimeFormat(locale, { year: "numeric", month: "long" });

  return (
    <div className="space-y-12">
      <JsonLd data={productJsonLd(product, locale)} />
      <div>
        <Breadcrumbs locale={locale} items={[...crumbs, { label: product.title }]} />
        <div className="grid gap-8 lg:grid-cols-2">
          <Gallery
            images={product.images}
            title={product.title}
            labels={{
              gallery: t("gallery"),
              showImage: product.images.map((_, i) => t("showImage", { n: i + 1 })),
            }}
          />

          <div className="space-y-5">
            <div className="space-y-2">
              {product.brand && (
                <Link href={`/search?brand=${product.brand.slug}`} className="text-sm font-medium text-brand">
                  {product.brand.name}
                </Link>
              )}
              <h1 className="text-2xl font-bold sm:text-3xl">{product.title}</h1>
              <p className="text-sm text-muted">
                {t("soldBy", { shop: product.shop.name })}
                {" · "}
                <Link href={`/s/${product.shop.slug}`} className="text-brand underline">
                  {t("visitShop")}
                </Link>
              </p>
              <a href="#reviews" className="flex items-center gap-2 text-sm text-muted">
                <Stars rating={product.ratingAvg} label={t("starsOutOf", { rating: product.ratingAvg.toFixed(1) })} />
                {t("reviewsCount", { count: product.ratingCount })}
              </a>
            </div>

            <VariantPicker variants={product.variants} />
            <WishlistButton productId={product.id} />
          </div>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-xl font-semibold">{t("description")}</h2>
            <p className="leading-relaxed whitespace-pre-line">{product.description}</p>
          </section>

          {specs.length > 0 && (
            <section>
              <h2 className="mb-3 text-xl font-semibold">{t("specs")}</h2>
              <table className="w-full overflow-hidden rounded-lg border border-border text-sm">
                <tbody>
                  {specs.map(([key, value]) => (
                    <tr key={key} className="border-b border-border last:border-0">
                      <th scope="row" className="w-1/3 bg-surface px-3 py-2 text-start font-medium">
                        {key}
                      </th>
                      <td className="px-3 py-2">{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <section id="reviews" className="scroll-mt-4 space-y-4">
            <h2 className="text-xl font-semibold">{t("reviews")}</h2>
            {totalRatings > 0 ? (
              <>
                <div className="flex flex-wrap items-center gap-6">
                  <div className="text-center">
                    <p className="text-4xl font-bold">{product.ratingAvg.toFixed(1)}</p>
                    <Stars rating={product.ratingAvg} size="lg" label={t("starsOutOf", { rating: product.ratingAvg.toFixed(1) })} />
                    <p className="text-sm text-muted">{t("reviewsCount", { count: totalRatings })}</p>
                  </div>
                  <ul className="min-w-48 flex-1 space-y-1 text-sm">
                    {product.ratingDistribution.map((r) => (
                      <li key={r.stars} className="flex items-center gap-2">
                        <span className="w-6">{r.stars}★</span>
                        <span className="h-2 flex-1 overflow-hidden rounded bg-surface">
                          <span className="block h-full bg-amber-500" style={{ width: `${(r.count / totalRatings) * 100}%` }} />
                        </span>
                        <span className="w-6 text-end text-muted">{r.count}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <ul className="divide-y divide-border">
                  {product.reviews.map((review) => (
                    <li key={review.id} className="space-y-1 py-4">
                      <Stars rating={review.rating} label={t("starsOutOf", { rating: review.rating })} />
                      {review.title && <p className="font-semibold">{review.title}</p>}
                      <p className="text-sm">{review.body}</p>
                      <p className="text-xs text-muted">
                        {review.author} · {t("verifiedBuyer")} · {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(review.createdAt)}
                      </p>
                      <ReportReview reviewId={review.id} />
                      {review.sellerReply && (
                        <div className="mt-2 rounded-md bg-surface p-3 text-sm">
                          <p className="font-medium">{t("sellerReply")}</p>
                          <p>{review.sellerReply}</p>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-muted">{t("noReviews")}</p>
            )}
            <p className="text-xs text-muted">{t("verifiedOnly")}</p>
          </section>
        </div>

        <aside className="h-fit space-y-3 rounded-lg border border-border p-4">
          <h2 className="font-semibold">{t("seller")}</h2>
          <div className="flex items-center gap-3">
            <div className="relative size-12 shrink-0 overflow-hidden rounded-full bg-surface">
              <ProductImage
                src={product.shop.logoUrl ?? `/placeholder/${product.shop.slug}.svg?w=96&h=96`}
                alt=""
                fill
                sizes="48px"
                className="object-cover"
              />
            </div>
            <div>
              <p className="font-medium">{product.shop.name}</p>
              <p className="text-xs text-muted">
                {t("memberSince", { date: dateFormat.format(product.shop.createdAt) })} ·{" "}
                {t("shopProducts", { count: product.shop._count.products })}
              </p>
            </div>
          </div>
          {product.shop.ratingCount > 0 && (
            <Stars rating={product.shop.ratingAvg} label={t("starsOutOf", { rating: product.shop.ratingAvg.toFixed(1) })} />
          )}
          <Link
            href={`/s/${product.shop.slug}`}
            className="block rounded-md border border-border px-3 py-2 text-center text-sm font-medium hover:bg-surface"
          >
            {t("visitShop")}
          </Link>
        </aside>
      </div>

      {related.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">{t("related")}</h2>
          <ProductGrid products={related.slice(0, 4)} locale={locale} />
        </section>
      )}
    </div>
  );
}

import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { ProductCardData } from "@/server/catalog";
import { ProductImage } from "./product-image";
import { Price } from "./price";
import { Stars } from "./stars";

export async function ProductCard({ product, locale, priority }: { product: ProductCardData; locale: string; priority?: boolean }) {
  const t = await getTranslations("product");
  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-lg border border-border bg-background">
      <div className="relative aspect-square bg-surface">
        {product.image && (
          <ProductImage
            src={product.image.url}
            alt={product.image.alt}
            fill
            priority={priority}
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            className="object-cover transition-transform group-hover:scale-[1.03]"
          />
        )}
        {product.discountPct > 0 && (
          <span className="absolute start-2 top-2 rounded bg-danger px-1.5 py-0.5 text-xs font-bold text-white">
            −{product.discountPct}%
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <h3 className="line-clamp-2 text-sm font-medium sm:text-base">
          {/* Stretched link: the whole card is clickable, but there's one link for screen readers. */}
          <Link href={`/p/${product.slug}`} className="after:absolute after:inset-0">
            {product.title}
          </Link>
        </h3>
        <p className="text-xs text-muted">{product.shopName}</p>
        {product.ratingCount > 0 && (
          <p className="flex items-center gap-1 text-xs text-muted">
            <Stars rating={product.ratingAvg} label={t("starsOutOf", { rating: product.ratingAvg.toFixed(1) })} />
            <span>({product.ratingCount})</span>
          </p>
        )}
        <div className="mt-auto pt-1">
          <Price amount={product.price} compareAt={product.compareAt} locale={locale} />
          {!product.inStock && <p className="text-xs font-medium text-danger">{t("outOfStock")}</p>}
        </div>
      </div>
    </article>
  );
}

export function ProductGrid({ products, locale, priorityCount = 0 }: { products: ProductCardData[]; locale: string; priorityCount?: number }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
      {products.map((p, i) => (
        <li key={p.id}>
          <ProductCard product={p} locale={locale} priority={i < priorityCount} />
        </li>
      ))}
    </ul>
  );
}

import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SORTS, catalogHref, type CatalogQuery } from "@/lib/catalog-query";
import { localized } from "@/lib/i18n-text";
import type { CatalogResult } from "@/server/catalog";
import { FilterPanel } from "./filter-panel";
import { Pagination } from "./pagination";
import { ProductGrid } from "./product-card";
import { SortSelect } from "./sort-select";

type Props = {
  locale: string;
  basePath: string; // locale-less, e.g. "/c/audio"
  query: CatalogQuery;
  result: CatalogResult;
  heading: ReactNode;
  // Facets fixed by the page aren't offered as filters.
  hide?: { shops?: boolean; deals?: boolean };
};

export async function CatalogView({ locale, basePath, query, result, heading, hide = {} }: Props) {
  const t = await getTranslations("catalog");
  const href = (changes: Partial<CatalogQuery>) => catalogHref(basePath, query, changes);
  const { facets } = result;

  const nameOf = (list: { slug: string; name: unknown }[], slug: string) => {
    const name = list.find((f) => f.slug === slug)?.name;
    return name === undefined ? slug : typeof name === "string" ? name : localized(name, locale);
  };

  // Active filters, each with a link that removes it.
  const chips: { label: string; href: string }[] = [
    ...query.categories.map((s) => ({
      label: nameOf(facets.categories, s),
      href: href({ categories: query.categories.filter((x) => x !== s) }),
    })),
    ...query.brands.map((s) => ({ label: nameOf(facets.brands, s), href: href({ brands: query.brands.filter((x) => x !== s) }) })),
    ...query.shops.map((s) => ({ label: nameOf(facets.shops, s), href: href({ shops: query.shops.filter((x) => x !== s) }) })),
    ...(query.minPrice !== undefined || query.maxPrice !== undefined
      ? [
          {
            label: t("priceRange", {
              min: query.minPrice !== undefined ? query.minPrice / 100 : 0,
              max: query.maxPrice !== undefined ? query.maxPrice / 100 : "∞",
            }),
            href: href({ minPrice: undefined, maxPrice: undefined }),
          },
        ]
      : []),
    ...(query.rating ? [{ label: t("ratingAndUp", { stars: query.rating }), href: href({ rating: undefined }) }] : []),
    ...(query.inStock ? [{ label: t("inStockOnly"), href: href({ inStock: false }) }] : []),
    ...(query.deals && !hide.deals ? [{ label: t("dealsOnly"), href: href({ deals: false }) }] : []),
  ];

  const hidden: Record<string, string> = {};
  if (query.q) hidden.q = query.q;
  if (query.sort !== (query.q ? "relevance" : "popular")) hidden.sort = query.sort;
  if (hide.deals) hidden.deals = "1";

  const sortOptions = SORTS.filter((s) => s !== "relevance" || query.q).map((s) => ({
    value: s,
    label: t(`sort.${s}`),
    href: href({ sort: s }),
  }));

  return (
    <div className="grid gap-6 lg:grid-cols-[15rem_1fr]">
      <div className="lg:col-span-2">{heading}</div>

      <aside>
        <FilterPanel
          // Remount when the URL changes so the inputs reflect the current query.
          key={href({ page: query.page })}
          action={basePath}
          hidden={hidden}
          groups={[
            {
              name: "category",
              title: t("category"),
              options: facets.categories.map((f) => ({ value: f.slug, label: localized(f.name, locale), count: f.count })),
              selected: query.categories,
            },
            {
              name: "brand",
              title: t("brand"),
              options: facets.brands.map((f) => ({ value: f.slug, label: String(f.name), count: f.count })),
              selected: query.brands,
            },
            ...(hide.shops
              ? []
              : [
                  {
                    name: "shop",
                    title: t("seller"),
                    options: facets.shops.map((f) => ({ value: f.slug, label: String(f.name), count: f.count })),
                    selected: query.shops,
                  },
                ]),
          ]}
          price={{
            min: query.minPrice !== undefined ? query.minPrice / 100 : undefined,
            max: query.maxPrice !== undefined ? query.maxPrice / 100 : undefined,
            placeholderMin: facets.price ? Math.floor(facets.price.min / 100) : undefined,
            placeholderMax: facets.price ? Math.ceil(facets.price.max / 100) : undefined,
          }}
          rating={query.rating}
          inStock={query.inStock}
          deals={query.deals}
          showDeals={!hide.deals}
          activeCount={chips.length}
          labels={{
            filters: t("filters"),
            filtersCount: t("filtersCount", { count: chips.length }),
            apply: t("apply"),
            price: t("price"),
            minPrice: t("minPrice"),
            maxPrice: t("maxPrice"),
            rating: t("rating"),
            ratingAndUp: Object.fromEntries([4, 3, 2, 1].map((s) => [s, t("ratingAndUp", { stars: s })])),
            availability: t("availability"),
            inStockOnly: t("inStockOnly"),
            dealsOnly: t("dealsOnly"),
          }}
        />
      </aside>

      <section className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted" aria-live="polite">
            {t("count", { count: result.total })}
          </p>
          <SortSelect label={t("sortLabel")} value={query.sort} options={sortOptions} />
        </div>

        {chips.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {chips.map((chip) => (
              <li key={chip.href + chip.label}>
                <Link
                  href={chip.href}
                  aria-label={t("remove", { label: chip.label })}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-1 text-sm hover:border-foreground"
                >
                  {chip.label} <span aria-hidden>×</span>
                </Link>
              </li>
            ))}
            <li>
              <Link
                href={catalogHref(basePath, { ...query, q: query.q, categories: [], brands: [], shops: [], minPrice: undefined, maxPrice: undefined, rating: undefined, inStock: false, deals: Boolean(hide.deals) })}
                className="inline-block px-2 py-1 text-sm text-brand underline"
              >
                {t("clearAll")}
              </Link>
            </li>
          </ul>
        )}

        {result.items.length > 0 ? (
          <ProductGrid products={result.items} locale={locale} priorityCount={4} />
        ) : (
          <div className="rounded-lg border border-dashed border-border p-10 text-center">
            <p className="font-medium">{t("noResults")}</p>
            <p className="mt-1 text-sm text-muted">{t("noResultsHint")}</p>
          </div>
        )}

        <Pagination
          page={result.page}
          pageCount={result.pageCount}
          hrefFor={(page) => href({ page })}
          labels={{
            pagination: t("pagination"),
            previous: t("previous"),
            next: t("next"),
            pageOf: t("pageOf", { page: result.page, pageCount: result.pageCount }),
          }}
        />
      </section>
    </div>
  );
}

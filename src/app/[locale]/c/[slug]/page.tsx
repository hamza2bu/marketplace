import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Breadcrumbs } from "@/components/catalog/breadcrumbs";
import { CatalogView } from "@/components/catalog/catalog-view";
import { ancestry, childrenOf } from "@/lib/category-tree";
import { hasActiveFilters, parseCatalogQuery } from "@/lib/catalog-query";
import { localized } from "@/lib/i18n-text";
import { localeAlternates } from "@/lib/seo";
import { getCategories, getCategoryBySlug, searchCatalog } from "@/server/catalog";

export async function generateMetadata({ params, searchParams }: PageProps<"/[locale]/c/[slug]">): Promise<Metadata> {
  const { locale, slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) return {};
  const query = parseCatalogQuery(await searchParams);
  const name = localized(category.name, locale);
  const t = await getTranslations({ locale, namespace: "meta" });
  return {
    title: name,
    description: `${name} · ${t("description")}`,
    alternates: localeAlternates(locale, `/c/${slug}`),
    openGraph: { title: name, images: category.imageUrl ? [category.imageUrl] : undefined },
    // Index the plain category page only, not every filter combination.
    robots: hasActiveFilters(query) || query.page > 1 ? { index: false, follow: true } : undefined,
  };
}

export default async function CategoryPage({ params, searchParams }: PageProps<"/[locale]/c/[slug]">) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const category = await getCategoryBySlug(slug);
  if (!category) notFound();

  const query = parseCatalogQuery(await searchParams);
  const [t, categories, result] = await Promise.all([
    getTranslations("catalog"),
    getCategories(),
    searchCatalog(query, { categoryId: category.id }),
  ]);
  const path = ancestry(categories, category.id);
  const subcategories = childrenOf(categories, category.id);

  return (
    <CatalogView
      locale={locale}
      basePath={`/c/${slug}`}
      query={query}
      result={result}
      heading={
        <div>
          <Breadcrumbs
            locale={locale}
            items={path.map((c) => ({ label: localized(c.name, locale), href: `/c/${c.slug}` }))}
          />
          <h1 className="text-2xl font-bold">{localized(category.name, locale)}</h1>
          {subcategories.length > 0 && (
            <nav aria-label={t("subcategories")} className="mt-3">
              <ul className="flex gap-2 overflow-x-auto pb-1">
                {subcategories.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/c/${c.slug}`}
                      className="inline-block rounded-full border border-border px-3 py-1 text-sm whitespace-nowrap hover:border-foreground"
                    >
                      {localized(c.name, locale)}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </div>
      }
    />
  );
}

import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CatalogView } from "@/components/catalog/catalog-view";
import { parseCatalogQuery } from "@/lib/catalog-query";
import { searchCatalog } from "@/server/catalog";

export async function generateMetadata({ params, searchParams }: PageProps<"/[locale]/search">): Promise<Metadata> {
  const { locale } = await params;
  const { q } = parseCatalogQuery(await searchParams);
  const t = await getTranslations({ locale, namespace: "catalog" });
  // Search result pages are useful to people, not to search engines.
  return { title: q ? t("resultsFor", { q }) : t("searchTitle"), robots: { index: false, follow: true } };
}

export default async function SearchPage({ params, searchParams }: PageProps<"/[locale]/search">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = parseCatalogQuery(await searchParams);
  const [t, result] = await Promise.all([getTranslations("catalog"), searchCatalog(query)]);

  return (
    <CatalogView
      locale={locale}
      basePath="/search"
      query={query}
      result={result}
      heading={<h1 className="text-2xl font-bold">{query.q ? t("resultsFor", { q: query.q }) : t("allProducts")}</h1>}
    />
  );
}

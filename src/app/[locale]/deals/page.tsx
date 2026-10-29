import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CatalogView } from "@/components/catalog/catalog-view";
import { hasActiveFilters, parseCatalogQuery } from "@/lib/catalog-query";
import { localeAlternates } from "@/lib/seo";
import { searchCatalog } from "@/server/catalog";

export async function generateMetadata({ params, searchParams }: PageProps<"/[locale]/deals">): Promise<Metadata> {
  const { locale } = await params;
  const query = parseCatalogQuery(await searchParams);
  const t = await getTranslations({ locale, namespace: "catalog" });
  const filtered = hasActiveFilters({ ...query, deals: false }) || query.page > 1;
  return {
    title: t("dealsTitle"),
    description: t("dealsIntro"),
    alternates: localeAlternates(locale, "/deals"),
    robots: filtered ? { index: false, follow: true } : undefined,
  };
}

export default async function DealsPage({ params, searchParams }: PageProps<"/[locale]/deals">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = { ...parseCatalogQuery(await searchParams), deals: true };
  const [t, result] = await Promise.all([getTranslations("catalog"), searchCatalog(query)]);

  return (
    <CatalogView
      locale={locale}
      basePath="/deals"
      query={query}
      result={result}
      hide={{ deals: true }}
      heading={
        <div>
          <h1 className="text-2xl font-bold">{t("dealsTitle")}</h1>
          <p className="text-muted">{t("dealsIntro")}</p>
        </div>
      }
    />
  );
}

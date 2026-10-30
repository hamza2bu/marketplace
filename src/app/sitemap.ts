import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { SITE_URL } from "@/lib/site";
import { getSitemapEntries } from "@/server/catalog";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { products, shops, categories } = await getSitemapEntries();
  const entry = (path: string, lastModified?: Date): MetadataRoute.Sitemap[number] => ({
    url: `${SITE_URL}/${routing.defaultLocale}${path}`,
    lastModified,
    alternates: { languages: Object.fromEntries(routing.locales.map((l) => [l, `${SITE_URL}/${l}${path}`])) },
  });
  return [
    entry(""),
    entry("/deals"),
    ...categories.map((c) => entry(`/c/${c.slug}`, c.updatedAt)),
    ...shops.map((s) => entry(`/s/${s.slug}`, s.updatedAt)),
    ...products.map((p) => entry(`/p/${p.slug}`, p.updatedAt)),
  ];
}

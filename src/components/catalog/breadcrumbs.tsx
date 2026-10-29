import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { absoluteUrl } from "@/lib/site";
import { JsonLd } from "@/components/json-ld";

export type Crumb = { label: string; href?: string };

/** `href`s are locale-less paths ("/c/audio"); `locale` is used for the JSON-LD URLs. */
export async function Breadcrumbs({ items, locale }: { items: Crumb[]; locale: string }) {
  const t = await getTranslations("breadcrumbs");
  const all: Crumb[] = [{ label: t("home"), href: "/" }, ...items];

  return (
    <nav aria-label={t("label")} className="mb-4 text-sm text-muted">
      <ol className="flex flex-wrap items-center gap-1">
        {all.map((crumb, i) => (
          <li key={i} className="flex items-center gap-1">
            {i > 0 && <span aria-hidden className="rtl:rotate-180">›</span>}
            {crumb.href && i < all.length - 1 ? (
              <Link href={crumb.href} className="hover:text-foreground">
                {crumb.label}
              </Link>
            ) : (
              <span aria-current={i === all.length - 1 ? "page" : undefined} className="text-foreground">
                {crumb.label}
              </span>
            )}
          </li>
        ))}
      </ol>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: all.map((crumb, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: crumb.label,
            ...(crumb.href ? { item: absoluteUrl(`/${locale}${crumb.href === "/" ? "" : crumb.href}`) } : {}),
          })),
        }}
      />
    </nav>
  );
}

import { getTranslations, setRequestLocale } from "next-intl/server";
import { db } from "@/server/db";
import { localized } from "@/lib/i18n-text";
import { formatMoney } from "@/lib/money";

// Placeholder home page for Phase 1: proves the seed data and i18n work.
// The real storefront (banners, deals, search) is built in Phase 2.

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("home");

  const [categories, products, shopCount] = await Promise.all([
    db.category.findMany({ where: { parentId: null, isActive: true }, orderBy: { sortOrder: "asc" } }),
    db.product.findMany({
      where: { status: "ACTIVE", isFeatured: true, shop: { status: "APPROVED" } },
      include: { shop: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    db.shop.count({ where: { status: "APPROVED" } }),
  ]);

  return (
    <div className="space-y-10">
      <section className="space-y-2">
        <h1 className="text-3xl font-bold sm:text-4xl">{t("heading")}</h1>
        <p className="text-muted">{t("subheading", { shops: shopCount, categories: categories.length })}</p>
        <p className="text-sm text-muted">{t("comingSoon")}</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t("categories")}</h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {categories.map((c) => (
            <li key={c.id} className="rounded-lg border border-border bg-surface p-4 text-center font-medium">
              {localized(c.name, locale)}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t("featured")}</h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {products.map((p) => (
            <li key={p.id} className="rounded-lg border border-border p-3">
              <p className="line-clamp-2 font-medium">{p.title}</p>
              <p className="text-sm text-muted">{p.shop.name}</p>
              <p className="mt-1 font-semibold">{formatMoney(p.minPriceMinor, locale)}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

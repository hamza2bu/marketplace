import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getCategories } from "@/server/catalog";
import { childrenOf } from "@/lib/category-tree";
import { localized } from "@/lib/i18n-text";
import type { Locale } from "@/i18n/routing";
import { LocaleSwitcher } from "./locale-switcher";
import { SearchBox, SearchBoxFallback } from "./search-box";
import { UserMenu } from "./user-menu";
import { CartLinkWithLabels } from "./cart-link-labels";

// No session read here: the header stays static so catalog pages can be
// cached. The signed-in part is the client-side <UserMenu>.
export async function SiteHeader({ locale }: { locale: Locale }) {
  const t = await getTranslations("nav");
  const topCategories = childrenOf(await getCategories(), null);

  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3">
        <Link href="/" className="text-2xl font-bold text-brand">
          {t("brand")}
        </Link>
        <div className="order-last w-full sm:order-none sm:w-auto sm:flex-1">
          <Suspense fallback={<SearchBoxFallback placeholder={t("searchPlaceholder")} label={t("searchButton")} />}>
            <SearchBox placeholder={t("searchPlaceholder")} label={t("searchButton")} />
          </Suspense>
        </div>
        <nav className="ms-auto flex items-center gap-x-4 text-sm sm:ms-0">
          <UserMenu
            locale={locale}
            labels={{
              signIn: t("signIn"),
              signUp: t("signUp"),
              signOut: t("signOut"),
              account: t("account"),
              seller: t("seller"),
              admin: t("admin"),
              orders: t("orders"),
              menu: t("menu"),
            }}
          />
          <LocaleSwitcher label={t("language")} />
          <CartLinkWithLabels />
        </nav>
      </div>
      <nav aria-label={t("categories")} className="border-t border-border">
        <ul className="mx-auto flex max-w-6xl gap-5 overflow-x-auto px-4 py-2 text-sm whitespace-nowrap [scrollbar-width:none]">
          <li>
            <Link href="/deals" className="font-semibold text-danger">
              {t("deals")}
            </Link>
          </li>
          {topCategories.map((c) => (
            <li key={c.id}>
              <Link href={`/c/${c.slug}`} className="text-foreground/80 hover:text-foreground">
                {localized(c.name, locale)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}

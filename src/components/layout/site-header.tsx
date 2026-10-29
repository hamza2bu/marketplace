import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { signOut } from "@/auth";
import { getCurrentUser } from "@/server/auth/guards";
import type { Locale } from "@/i18n/routing";
import { LocaleSwitcher } from "./locale-switcher";

export async function SiteHeader({ locale }: { locale: Locale }) {
  const t = await getTranslations("nav");
  const user = await getCurrentUser();

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: `/${locale}` });
  }

  return (
    <header className="border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Link href="/" className="text-xl font-bold text-brand">
          {t("brand")}
        </Link>

        <nav className="ms-auto flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          {user ? (
            <>
              {user.role === "SELLER" && <Link href="/seller">{t("seller")}</Link>}
              {user.role === "ADMIN" && <Link href="/admin">{t("admin")}</Link>}
              <Link href="/account">{t("account")}</Link>
              <form action={signOutAction}>
                <button type="submit" className="text-muted hover:text-foreground">
                  {t("signOut")}
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/sign-in">{t("signIn")}</Link>
              <Link
                href="/sign-up"
                className="rounded-md bg-brand px-3 py-1.5 font-medium text-brand-foreground"
              >
                {t("signUp")}
              </Link>
            </>
          )}
          <LocaleSwitcher label={t("language")} />
        </nav>
      </div>
    </header>
  );
}

import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/server/auth/guards";

export const metadata: Metadata = { robots: { index: false } };

export default async function AccountPage({ params }: PageProps<"/[locale]/account">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale, `/${locale}/account`);
  const t = await getTranslations("account");
  const roles = await getTranslations("roles");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("greeting", { name: user.name ?? user.email })}</h1>
      <dl className="grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-muted">{t("email")}</dt>
          <dd dir="ltr" className="text-start">{user.email}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted">{t("role")}</dt>
          <dd>{roles(user.role)}</dd>
        </div>
      </dl>
      <ul className="grid gap-3 sm:grid-cols-3">
        {(
          [
            ["orders", "/account/orders"],
            ["addresses", "/account/addresses"],
          ] as const
        ).map(([key, href]) => (
          <li key={key}>
            <Link href={href} className="block rounded-lg border border-border bg-surface p-4 hover:border-foreground">
              <p className="font-medium">{t(key)}</p>
              <p className="text-sm text-brand">{t("manage")} →</p>
            </Link>
          </li>
        ))}
        <li className="rounded-lg border border-border bg-surface p-4">
          <p className="font-medium">{t("wishlist")}</p>
          <p className="text-sm text-muted">{t("soon")}</p>
        </li>
      </ul>
    </div>
  );
}

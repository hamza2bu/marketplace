import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { localeAlternates } from "@/lib/seo";
import { getCurrentUser } from "@/server/auth/guards";
import { OnboardingForm } from "./onboarding-form";

export async function generateMetadata({ params }: PageProps<"/[locale]/sell">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "sell" });
  return { title: t("title"), description: t("intro"), alternates: localeAlternates(locale, "/sell") };
}

export default async function SellPage({ params }: PageProps<"/[locale]/sell">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, nav, user] = await Promise.all([getTranslations("sell"), getTranslations("nav"), getCurrentUser()]);
  if (user?.shop) redirect(`/${locale}/seller`);

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header className="space-y-3">
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="text-muted">{t("intro")}</p>
        <ul className="space-y-1 text-sm">
          {(["benefit1", "benefit2", "benefit3"] as const).map((key) => (
            <li key={key} className="flex gap-2">
              <span aria-hidden className="text-brand">✓</span>
              {t(key)}
            </li>
          ))}
        </ul>
      </header>

      {!user ? (
        <div className="space-y-3 rounded-lg border border-border p-6 text-center">
          <p>{t("signInFirst")}</p>
          <div className="flex justify-center gap-3">
            <Link href="/sign-up" className="rounded-md bg-brand px-4 py-2 font-medium text-brand-foreground">
              {nav("signUp")}
            </Link>
            <Link href={`/sign-in?callbackUrl=${encodeURIComponent(`/${locale}/sell`)}`} className="rounded-md border border-border px-4 py-2 font-medium">
              {nav("signIn")}
            </Link>
          </div>
        </div>
      ) : user.role === "ADMIN" ? (
        <p className="rounded-md bg-surface p-4">{t("adminCannot")}</p>
      ) : (
        <OnboardingForm defaultEmail={user.email} />
      )}
    </div>
  );
}

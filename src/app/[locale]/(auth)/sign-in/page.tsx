import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SignInForm } from "../auth-forms";

export async function generateMetadata({ params }: PageProps<"/[locale]/sign-in">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });
  return { title: t("signInTitle"), robots: { index: false } };
}

export default async function SignInPage({ params, searchParams }: PageProps<"/[locale]/sign-in">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { callbackUrl } = await searchParams;
  const t = await getTranslations("auth");
  const nav = await getTranslations("nav");

  return (
    <div className="mx-auto max-w-sm space-y-6">
      <h1 className="text-2xl font-bold">{t("signInTitle")}</h1>
      <SignInForm callbackUrl={typeof callbackUrl === "string" ? callbackUrl : undefined} />
      <p className="text-sm">
        <Link href="/forgot-password" className="text-brand underline">
          {t("forgot")}
        </Link>
      </p>
      <p className="text-sm text-muted">
        {t("noAccount")}{" "}
        <Link href="/sign-up" className="font-medium text-brand">
          {nav("signUp")}
        </Link>
      </p>
    </div>
  );
}

import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SignUpForm } from "../auth-forms";

export async function generateMetadata({ params }: PageProps<"/[locale]/sign-up">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });
  return { title: t("signUpTitle"), robots: { index: false } };
}

export default async function SignUpPage({ params }: PageProps<"/[locale]/sign-up">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth");
  const nav = await getTranslations("nav");

  return (
    <div className="mx-auto max-w-sm space-y-6">
      <h1 className="text-2xl font-bold">{t("signUpTitle")}</h1>
      <SignUpForm />
      <p className="text-sm text-muted">
        {t("haveAccount")}{" "}
        <Link href="/sign-in" className="font-medium text-brand">
          {nav("signIn")}
        </Link>
      </p>
    </div>
  );
}

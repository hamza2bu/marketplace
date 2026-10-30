import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ForgotPasswordForm } from "../reset-forms";

export const metadata: Metadata = { robots: { index: false } };

export default async function ForgotPasswordPage({ params }: PageProps<"/[locale]/forgot-password">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth");
  return (
    <div className="mx-auto max-w-sm space-y-4">
      <h1 className="text-2xl font-bold">{t("forgotTitle")}</h1>
      <p className="text-sm text-muted">{t("forgotIntro")}</p>
      <ForgotPasswordForm />
    </div>
  );
}

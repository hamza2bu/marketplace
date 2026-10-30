import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ResetPasswordForm } from "../reset-forms";

export const metadata: Metadata = { robots: { index: false }, referrer: "no-referrer" };

export default async function ResetPasswordPage({ params, searchParams }: PageProps<"/[locale]/reset-password">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const t = await getTranslations("auth");
  return (
    <div className="mx-auto max-w-sm space-y-4">
      <h1 className="text-2xl font-bold">{t("resetTitle")}</h1>
      <ResetPasswordForm email={typeof sp.email === "string" ? sp.email : ""} token={typeof sp.token === "string" ? sp.token : ""} />
    </div>
  );
}

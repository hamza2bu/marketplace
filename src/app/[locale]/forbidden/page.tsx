import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export const metadata: Metadata = { robots: { index: false } };

export default async function ForbiddenPage({ params }: PageProps<"/[locale]/forbidden">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("forbidden");

  return (
    <div className="mx-auto max-w-md space-y-4 py-12 text-center">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="text-muted">{t("body")}</p>
      <Link href="/" className="inline-block rounded-md bg-brand px-4 py-2 font-medium text-brand-foreground">
        {t("back")}
      </Link>
    </div>
  );
}

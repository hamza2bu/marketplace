import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireSeller } from "@/server/auth/guards";
import { ImportForm } from "./import-form";

export const metadata: Metadata = { robots: { index: false } };

export default async function ImportProductsPage({ params }: PageProps<"/[locale]/seller/products/import">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireSeller(locale);
  const t = await getTranslations("seller.import");
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="text-muted">{t("intro")}</p>
      <p className="text-sm text-muted">{t("columnsHelp")}</p>
      <a href="/api/seller/csv-template" className="inline-block text-sm text-brand underline" download>
        {t("template")}
      </a>
      <ImportForm />
    </div>
  );
}

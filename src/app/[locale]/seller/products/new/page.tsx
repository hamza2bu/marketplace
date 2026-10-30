import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ProductForm } from "@/components/seller/product-form";
import { requireSeller } from "@/server/auth/guards";
import { categoryOptions, emptyProduct } from "../load";

export const metadata: Metadata = { robots: { index: false } };

export default async function NewProductPage({ params }: PageProps<"/[locale]/seller/products/new">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { shop } = await requireSeller(locale);
  const [t, categories] = await Promise.all([getTranslations("seller.form"), categoryOptions(locale)]);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("newTitle")}</h1>
      <ProductForm initial={emptyProduct} categories={categories} shopPending={shop.status !== "APPROVED"} />
    </div>
  );
}

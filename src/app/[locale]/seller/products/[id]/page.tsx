import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ProductForm } from "@/components/seller/product-form";
import { requireSeller } from "@/server/auth/guards";
import { db } from "@/server/db";
import { categoryOptions, productFormValues } from "../load";

export const metadata: Metadata = { robots: { index: false } };

export default async function EditProductPage({ params, searchParams }: PageProps<"/[locale]/seller/products/[id]">) {
  const { locale, id } = await params;
  const justSaved = (await searchParams).saved === "1";
  setRequestLocale(locale);
  const { shop } = await requireSeller(locale);
  const [t, productsT, categories, values, note] = await Promise.all([
    getTranslations("seller.form"),
    getTranslations("seller.products"),
    categoryOptions(locale),
    productFormValues(shop.id, id),
    db.product.findFirst({ where: { id, shopId: shop.id }, select: { moderationNote: true, status: true } }),
  ]);
  if (!values) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{t("editTitle")}</h1>
        <span className="rounded-full bg-surface px-3 py-1 text-sm">{productsT(`status.${values.status as "DRAFT"}`)}</span>
      </div>
      {note?.moderationNote && (
        <p className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{productsT("adminNote", { note: note.moderationNote })}</p>
      )}
      <ProductForm initial={values} categories={categories} shopPending={shop.status !== "APPROVED"} justSaved={justSaved} />
    </div>
  );
}

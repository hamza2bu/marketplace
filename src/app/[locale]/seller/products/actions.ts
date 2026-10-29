"use server";

import { refresh } from "next/cache";
import { productInputSchema } from "@/lib/validation/seller";
import { parseProductCsv } from "@/lib/csv-import";
import { db } from "@/server/db";
import { sellerAction } from "@/server/seller/context";
import { changeProductLifecycle, saveProduct } from "@/server/seller/products";
import { uploadTarget } from "@/server/storage";
import type { ProductStatus } from "@/generated/prisma/enums";

export type SaveProductState = {
  ok?: boolean;
  id?: string;
  slug?: string;
  status?: ProductStatus;
  error?: string;
  errorValues?: Record<string, string>;
  fieldErrors?: Record<string, string>;
};

export async function saveProductAction(locale: string, productId: string | null, input: unknown): Promise<SaveProductState> {
  const { shop, limited } = await sellerAction(locale);
  if (limited) return { error: "rateLimited" };

  const parsed = productInputSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[issue.path.join(".")] ??= issue.message;
    return { fieldErrors };
  }
  const result = await saveProduct(shop, parsed.data, productId ?? undefined);
  if (!result.ok) {
    const { code, ...values } = result.error;
    return { error: code, errorValues: values as Record<string, string> };
  }
  const saved = await db.product.findUniqueOrThrow({ where: { id: result.id }, select: { status: true } });
  return { ok: true, id: result.id, slug: result.slug, status: saved.status };
}

export async function productLifecycleAction(formData: FormData): Promise<void> {
  const { shop, limited } = await sellerAction(formData.get("locale"));
  const action = String(formData.get("action"));
  if (limited || !["archive", "restore", "delete"].includes(action)) return;
  await changeProductLifecycle(shop.id, String(formData.get("productId") ?? ""), action as "archive" | "restore" | "delete");
  refresh();
}

/** Where the browser should upload an image (Cloudinary signature, or the local dev endpoint). */
export async function prepareUploadAction(locale: string) {
  const { shop } = await sellerAction(locale);
  return uploadTarget(shop.id);
}

export type ImportState = {
  done?: boolean;
  created?: number;
  updated?: number;
  failed?: number;
  errors?: { row: number; message: string; detail?: string }[];
};

/** Bulk create/update from CSV. Each product is saved on its own, so one bad product doesn't block the rest. */
export async function importCsvAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const { shop, limited } = await sellerAction(formData.get("locale"));
  if (limited) return { done: true, errors: [{ row: 0, message: "rateLimited" }] };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { done: true, errors: [{ row: 0, message: "csvNoFile" }] };
  if (file.size > 2 * 1024 * 1024) return { done: true, errors: [{ row: 0, message: "csvTooLarge" }] };

  const { products, errors } = parseProductCsv(await file.text());
  const job = await db.csvImportJob.create({ data: { shopId: shop.id, status: "PROCESSING", totalRows: products.reduce((n, p) => n + p.rows.length, 0) } });
  const categories = await db.category.findMany({ where: { isActive: true, children: { none: {} } }, select: { id: true, slug: true } });
  let created = 0;
  let updated = 0;
  let failed = 0;

  for (const p of products) {
    const row = p.rows[0];
    // Every row of this product was rejected by the parser (already reported).
    if (p.variants.length === 0) {
      failed++;
      continue;
    }
    const category = categories.find((c) => c.slug === p.categorySlug);
    const existing = await db.product.findFirst({
      where: { slug: p.handle, shopId: shop.id },
      select: { id: true, variants: { where: { archivedAt: null }, select: { id: true, sku: true } } },
    });
    if (!category && !existing) {
      failed++;
      errors.push({ row, message: "csvUnknownCategory", detail: p.categorySlug });
      continue;
    }
    const current = existing ? await db.product.findUniqueOrThrow({ where: { id: existing.id }, select: { categoryId: true, title: true, description: true } }) : null;
    const parsed = productInputSchema.safeParse({
      title: p.title || current?.title || "",
      slug: p.handle,
      categoryId: category?.id ?? current!.categoryId,
      brandName: p.brandName,
      description: p.description || current?.description || "",
      specs: p.specs,
      images: p.images,
      // Match existing variants by SKU so updates keep their history.
      variants: p.variants.map((v) => ({ ...v, id: existing?.variants.find((e) => e.sku === v.sku.toUpperCase())?.id })),
      // CSV rows can't carry uploads; without images a product can only be a draft.
      intent: p.publish && p.images.length > 0 ? "publish" : "draft",
    });
    if (!parsed.success) {
      failed++;
      const issue = parsed.error.issues[0];
      errors.push({ row, message: issue.message, detail: issue.path.join(".") });
      continue;
    }
    const result = await saveProduct(shop, parsed.data, existing?.id);
    if (result.ok) {
      if (existing) updated++;
      else created++;
      if (p.publish && p.images.length === 0) errors.push({ row, message: "csvSavedAsDraft" });
    } else {
      failed++;
      errors.push({ row, message: result.error.code, detail: "sku" in result.error ? result.error.sku : undefined });
    }
  }

  errors.sort((a, b) => a.row - b.row);
  await db.csvImportJob.update({
    where: { id: job.id },
    data: { status: "COMPLETED", okRows: created + updated, errors: errors.slice(0, 500) },
  });
  return { done: true, created, updated, failed, errors: errors.slice(0, 200) };
}

import "server-only";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { Prisma } from "@/generated/prisma/client";
import type { ProductStatus } from "@/generated/prisma/enums";
import { routing } from "@/i18n/routing";
import { isAllowedImageUrl } from "@/lib/images";
import { slugify, type ProductInput } from "@/lib/validation/seller";
import { refreshProductPricing } from "@/server/discounts";
import { cloudinaryConfig } from "@/server/storage";

export type SaveProductError =
  | { code: "not_found" }
  | { code: "category_invalid" }
  | { code: "image_not_allowed" }
  | { code: "slug_taken" }
  | { code: "sku_taken"; sku: string }
  | { code: "shop_suspended" };

type Shop = { id: string; status: string };

/** Clears cached public pages that show this product. */
export function revalidateProductPages(slugs: string[]) {
  for (const locale of routing.locales) {
    revalidatePath(`/${locale}`);
    for (const slug of slugs) revalidatePath(`/${locale}/p/${slug}`);
  }
}

async function uniqueSlug(tx: Prisma.TransactionClient, wanted: string, productId?: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? wanted : `${wanted}-${randomBytes(2).toString("hex")}`;
    const clash = await tx.product.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!clash || clash.id === productId) return candidate;
  }
  throw new Error("Could not find a free slug");
}

/**
 * Creates or updates a product with its variants and images, for one shop.
 * "Publish" makes it live (if the shop is approved); a product an admin
 * rejected goes back to review instead.
 */
export async function saveProduct(
  shop: Shop,
  input: ProductInput,
  productId?: string,
): Promise<{ ok: true; id: string; slug: string } | { ok: false; error: SaveProductError }> {
  if (shop.status === "SUSPENDED" || shop.status === "REMOVED") return { ok: false, error: { code: "shop_suspended" } };

  const cloud = cloudinaryConfig()?.cloud;
  if (input.images.some((img) => !isAllowedImageUrl(img.url, cloud))) return { ok: false, error: { code: "image_not_allowed" } };

  const category = await db.category.findFirst({
    where: { id: input.categoryId, isActive: true, children: { none: {} } },
    select: { id: true },
  });
  if (!category) return { ok: false, error: { code: "category_invalid" } };

  const existing = productId
    ? await db.product.findFirst({
        where: { id: productId, shopId: shop.id },
        include: { variants: { where: { archivedAt: null }, include: { _count: { select: { orderItems: true } } } } },
      })
    : null;
  if (productId && !existing) return { ok: false, error: { code: "not_found" } };

  // SKUs are unique across the marketplace.
  const skuClash = await db.productVariant.findFirst({
    where: { sku: { in: input.variants.map((v) => v.sku) }, ...(existing ? { productId: { not: existing.id } } : {}) },
    select: { sku: true },
  });
  if (skuClash) return { ok: false, error: { code: "sku_taken", sku: skuClash.sku } };

  let status: ProductStatus = "DRAFT";
  if (input.intent === "publish") status = existing?.status === "REJECTED" || existing?.status === "PENDING_REVIEW" ? "PENDING_REVIEW" : "ACTIVE";

  try {
    const saved = await db.$transaction(async (tx) => {
      const brandName = input.brandName.trim();
      const brandSlug = slugify(brandName) || (brandName ? `brand-${randomBytes(3).toString("hex")}` : "");
      const brand = brandName
        ? ((await tx.brand.findFirst({ where: { OR: [{ slug: brandSlug }, { name: { equals: brandName, mode: "insensitive" } }] } })) ??
          (await tx.brand.create({ data: { name: brandName, slug: brandSlug } })))
        : null;

      const wantedSlug = input.slug || existing?.slug || slugify(input.title) || `p-${randomBytes(4).toString("hex")}`;
      const slug = await uniqueSlug(tx, wantedSlug, existing?.id);
      const data = {
        title: input.title,
        slug,
        description: input.description,
        specs: Object.fromEntries(input.specs.map((s) => [s.key, s.value])),
        categoryId: category.id,
        brandId: brand?.id ?? null,
        status,
        ...(status === "PENDING_REVIEW" ? {} : { moderationNote: null }),
      };
      const product = existing
        ? await tx.product.update({ where: { id: existing.id }, data })
        : await tx.product.create({ data: { ...data, shopId: shop.id } });

      // Variants: update by id, create new ones, and remove the rest. A variant
      // that was ever ordered is deactivated instead, to keep order history intact.
      const keepIds = new Set(input.variants.map((v) => v.id).filter(Boolean));
      for (const old of existing?.variants ?? []) {
        if (keepIds.has(old.id)) continue;
        if (old._count.orderItems > 0) {
          await tx.productVariant.update({
            where: { id: old.id },
            data: { isActive: false, archivedAt: new Date(), sku: `${old.sku}~${old.id}`.slice(0, 120) },
          });
        }
        else await tx.productVariant.delete({ where: { id: old.id } });
      }
      const firstActive = input.variants.findIndex((v) => v.isActive);
      for (const [i, v] of input.variants.entries()) {
        const fields = {
          sku: v.sku,
          attributes: v.attributes,
          priceMinor: v.priceMinor,
          compareAtMinor: v.compareAtMinor,
          stock: v.stock,
          isActive: v.isActive,
          isDefault: i === Math.max(0, firstActive),
        };
        const owned = v.id && existing?.variants.some((old) => old.id === v.id);
        if (owned) await tx.productVariant.update({ where: { id: v.id }, data: fields });
        else await tx.productVariant.create({ data: { ...fields, productId: product.id } });
      }

      await tx.productImage.deleteMany({ where: { productId: product.id } });
      if (input.images.length) {
        await tx.productImage.createMany({
          data: input.images.map((img, position) => ({ productId: product.id, url: img.url, alt: img.alt || input.title, position })),
        });
      }
      return product;
    });

    await refreshProductPricing({ productIds: [saved.id] });
    revalidateProductPages(existing && existing.slug !== saved.slug ? [existing.slug, saved.slug] : [saved.slug]);
    return { ok: true, id: saved.id, slug: saved.slug };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const target = String(error.meta?.target ?? "");
      return { ok: false, error: target.includes("sku") ? { code: "sku_taken", sku: "" } : { code: "slug_taken" } };
    }
    throw error;
  }
}

/** Archives, restores (to draft) or deletes a product. Products with orders are archived instead of deleted. */
export async function changeProductLifecycle(shopId: string, productId: string, action: "archive" | "restore" | "delete") {
  const product = await db.product.findFirst({
    where: { id: productId, shopId },
    select: { id: true, slug: true, variants: { select: { _count: { select: { orderItems: true } } } } },
  });
  if (!product) return { ok: false as const };
  const hasOrders = product.variants.some((v) => v._count.orderItems > 0);

  if (action === "delete" && !hasOrders) {
    await db.product.delete({ where: { id: product.id } });
  } else {
    await db.product.update({ where: { id: product.id }, data: { status: action === "restore" ? "DRAFT" : "ARCHIVED" } });
  }
  revalidateProductPages([product.slug]);
  return { ok: true as const, archivedInstead: action === "delete" && hasOrders };
}

export async function getSellerProducts(shopId: string, opts: { q?: string; status?: ProductStatus; page: number; pageSize?: number }) {
  const pageSize = opts.pageSize ?? 20;
  const where: Prisma.ProductWhereInput = {
    shopId,
    ...(opts.status ? { status: opts.status } : { status: { not: "ARCHIVED" } }),
    ...(opts.q
      ? {
          OR: [
            { title: { contains: opts.q, mode: "insensitive" } },
            { variants: { some: { sku: { contains: opts.q.toUpperCase() } } } },
          ],
        }
      : {}),
  };
  const [products, total] = await Promise.all([
    db.product.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (opts.page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        moderationNote: true,
        minPriceMinor: true,
        hasDeal: true,
        images: { select: { url: true }, orderBy: { position: "asc" }, take: 1 },
        variants: { where: { isActive: true }, select: { stock: true } },
        category: { select: { name: true } },
      },
    }),
    db.product.count({ where }),
  ]);
  return { products, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getSellerProduct(shopId: string, productId: string) {
  return db.product.findFirst({
    where: { id: productId, shopId },
    include: {
      brand: { select: { name: true } },
      images: { orderBy: { position: "asc" } },
      variants: { orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }], where: { archivedAt: null } },
    },
  });
}

/** Leaf categories (the ones products go in), with their parent's name for grouping. */
export async function leafCategories() {
  return db.category.findMany({
    where: { isActive: true, children: { none: {} } },
    select: { id: true, slug: true, name: true, parent: { select: { name: true } } },
    orderBy: [{ parent: { sortOrder: "asc" } }, { sortOrder: "asc" }],
  });
}

// ───────────────────────── Discounts ─────────────────────────

export async function getShopDiscounts(shopId: string) {
  return db.discount.findMany({
    where: { shopId },
    orderBy: [{ isActive: "desc" }, { endsAt: "desc" }],
    include: { product: { select: { title: true, slug: true } } },
    take: 100,
  });
}

export async function createDiscount(
  shopId: string,
  input: { productId: string | null; type: "PERCENT" | "FIXED"; value: number; startsAt: Date; endsAt: Date },
) {
  if (input.productId) {
    const owned = await db.product.findFirst({ where: { id: input.productId, shopId }, select: { id: true } });
    if (!owned) return { ok: false as const };
  }
  await db.discount.create({ data: { ...input, shopId } });
  await refreshAfterDiscountChange(shopId, input.productId);
  return { ok: true as const };
}

export async function endDiscount(shopId: string, discountId: string) {
  const discount = await db.discount.findFirst({ where: { id: discountId, shopId } });
  if (!discount) return { ok: false as const };
  await db.discount.update({ where: { id: discount.id }, data: { isActive: false } });
  await refreshAfterDiscountChange(shopId, discount.productId);
  return { ok: true as const };
}

async function refreshAfterDiscountChange(shopId: string, productId: string | null) {
  await refreshProductPricing(productId ? { productIds: [productId] } : { shopIds: [shopId] });
  const products = await db.product.findMany({
    where: productId ? { id: productId } : { shopId, status: "ACTIVE" },
    select: { slug: true },
  });
  revalidateProductPages(products.map((p) => p.slug));
}

import "server-only";
import { revalidatePath, revalidateTag } from "next/cache";
import { db } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import type { ProductStatus, ReviewStatus } from "@/generated/prisma/enums";
import { routing } from "@/i18n/routing";
import { isAllowedImageUrl } from "@/lib/images";
import type { BannerInput, CategoryInput, SettingsInput } from "@/lib/validation/admin";
import { CATEGORIES_TAG } from "@/server/catalog";
import { recomputeRatings } from "@/server/reviews";
import { revalidateProductPages } from "@/server/seller/products";
import { cloudinaryConfig } from "@/server/storage";
import { audit, queueEmail } from "./audit";

// ───────────────────────── Products ─────────────────────────

export async function listProductsForAdmin(opts: { status?: ProductStatus; q?: string; page: number; pageSize?: number }) {
  const pageSize = opts.pageSize ?? 25;
  const where: Prisma.ProductWhereInput = {
    ...(opts.status ? { status: opts.status } : {}),
    ...(opts.q
      ? {
          OR: [
            { title: { contains: opts.q, mode: "insensitive" } },
            { slug: { contains: opts.q.toLowerCase() } },
            { shop: { name: { contains: opts.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const [products, total] = await Promise.all([
    db.product.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }],
      skip: (opts.page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        isFeatured: true,
        moderationNote: true,
        minPriceMinor: true,
        updatedAt: true,
        shop: { select: { name: true, status: true } },
        images: { select: { url: true }, orderBy: { position: "asc" }, take: 1 },
      },
    }),
    db.product.count({ where }),
  ]);
  return { products, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

export type ModerationAction = { action: "approve" } | { action: "reject"; note: string } | { action: "feature" } | { action: "unfeature" };

export async function moderateProduct(adminId: string, productId: string, decision: ModerationAction) {
  const product = await db.product.findUnique({
    where: { id: productId },
    select: { id: true, slug: true, title: true, status: true, shop: { select: { contactEmail: true, ownerId: true } } },
  });
  if (!product) return { ok: false as const };

  let data: Prisma.ProductUpdateInput;
  switch (decision.action) {
    case "approve":
      if (product.status !== "PENDING_REVIEW" && product.status !== "REJECTED") return { ok: false as const };
      data = { status: "ACTIVE", moderationNote: null };
      break;
    case "reject":
      if (product.status === "ARCHIVED") return { ok: false as const };
      data = { status: "REJECTED", moderationNote: decision.note, isFeatured: false };
      break;
    case "feature":
      if (product.status !== "ACTIVE") return { ok: false as const };
      data = { isFeatured: true };
      break;
    case "unfeature":
      data = { isFeatured: false };
      break;
  }
  await db.product.update({ where: { id: productId }, data });
  await audit(db, adminId, `product.${decision.action}`, "Product", productId, decision.action === "reject" ? { note: decision.note } : {});
  if (decision.action === "reject" || decision.action === "approve") {
    await queueEmail(db, product.shop.contactEmail, product.shop.ownerId, decision.action === "reject" ? "product-rejected" : "product-approved", {
      title: product.title,
      note: decision.action === "reject" ? decision.note : null,
    });
  }
  revalidateProductPages([product.slug]);
  return { ok: true as const };
}

// ───────────────────────── Reviews ─────────────────────────

export async function listReviewsForAdmin(opts: { status?: ReviewStatus; page: number; pageSize?: number }) {
  const pageSize = opts.pageSize ?? 25;
  // "Flagged" means reported by shoppers and not yet decided (still visible).
  const where: Prisma.ReviewWhereInput =
    opts.status === "FLAGGED" ? { flaggedAt: { not: null }, status: "VISIBLE" } : opts.status ? { status: opts.status } : {};
  const [reviews, total] = await Promise.all([
    db.review.findMany({
      where,
      // Reported ones first: that's the moderation queue.
      orderBy: [{ flaggedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      skip: (opts.page - 1) * pageSize,
      take: pageSize,
      include: { product: { select: { title: true, slug: true } }, user: { select: { email: true, name: true } } },
    }),
    db.review.count({ where }),
  ]);
  return { reviews, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function moderateReview(adminId: string, reviewId: string, action: "show" | "hide" | "delete") {
  const review = await db.review.findUnique({ where: { id: reviewId }, select: { id: true, productId: true, product: { select: { slug: true } } } });
  if (!review) return { ok: false as const };
  if (action === "delete") await db.review.delete({ where: { id: reviewId } });
  // Either decision closes the report.
  else await db.review.update({ where: { id: reviewId }, data: { status: action === "show" ? "VISIBLE" : "HIDDEN", flaggedAt: null } });
  await audit(db, adminId, `review.${action}`, "Review", reviewId);
  await recomputeRatings(review.productId);
  revalidateProductPages([review.product.slug]);
  return { ok: true as const };
}

// ───────────────────────── Categories ─────────────────────────

function revalidateCategories() {
  revalidateTag(CATEGORIES_TAG, "max");
  for (const locale of routing.locales) revalidatePath(`/${locale}`);
}

export async function listCategoriesForAdmin() {
  return db.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { slug: "asc" }],
    include: { _count: { select: { products: true, children: true } } },
  });
}

export type CategoryError = "slug_taken" | "bad_parent" | "has_products" | "has_children" | "image_not_allowed" | "not_found";

/** Two levels: top-level categories, and leaves under them. Products live in leaves. */
async function checkParent(parentId: string | null, selfId?: string): Promise<CategoryError | null> {
  if (!parentId) return null;
  if (parentId === selfId) return "bad_parent";
  const parent = await db.category.findUnique({ where: { id: parentId }, include: { _count: { select: { products: true } } } });
  if (!parent || parent.parentId) return "bad_parent";
  if (parent._count.products > 0) return "has_products"; // it would stop being a leaf
  if (selfId && (await db.category.count({ where: { parentId: selfId } })) > 0) return "bad_parent";
  return null;
}

export async function saveCategory(adminId: string, input: CategoryInput, id?: string): Promise<{ ok: true; id: string } | { ok: false; error: CategoryError }> {
  if (input.imageUrl && !isAllowedImageUrl(input.imageUrl, cloudinaryConfig()?.cloud)) return { ok: false, error: "image_not_allowed" };
  const parentError = await checkParent(input.parentId, id);
  if (parentError) return { ok: false, error: parentError };
  const clash = await db.category.findUnique({ where: { slug: input.slug }, select: { id: true } });
  if (clash && clash.id !== id) return { ok: false, error: "slug_taken" };

  const saved = id ? await db.category.update({ where: { id }, data: input }) : await db.category.create({ data: input });
  await audit(db, adminId, id ? "category.update" : "category.create", "Category", saved.id, { slug: input.slug, commissionBps: input.commissionBps });
  revalidateCategories();
  return { ok: true, id: saved.id };
}

export async function deleteCategory(adminId: string, id: string): Promise<{ ok: boolean; error?: CategoryError }> {
  const category = await db.category.findUnique({ where: { id }, include: { _count: { select: { products: true, children: true } } } });
  if (!category) return { ok: false, error: "not_found" };
  if (category._count.products > 0) return { ok: false, error: "has_products" };
  if (category._count.children > 0) return { ok: false, error: "has_children" };
  await db.category.delete({ where: { id } });
  await audit(db, adminId, "category.delete", "Category", id, { slug: category.slug });
  revalidateCategories();
  return { ok: true };
}

// ───────────────────────── Banners ─────────────────────────

export async function saveBanner(adminId: string, input: BannerInput, id?: string) {
  if (!isAllowedImageUrl(input.imageUrl, cloudinaryConfig()?.cloud)) return { ok: false as const, error: "image_not_allowed" };
  const data = { ...input, placement: "home-hero" };
  const saved = id ? await db.banner.update({ where: { id }, data }) : await db.banner.create({ data });
  await audit(db, adminId, id ? "banner.update" : "banner.create", "Banner", saved.id);
  for (const locale of routing.locales) revalidatePath(`/${locale}`);
  return { ok: true as const };
}

export async function deleteBanner(adminId: string, id: string) {
  await db.banner.deleteMany({ where: { id } });
  await audit(db, adminId, "banner.delete", "Banner", id);
  for (const locale of routing.locales) revalidatePath(`/${locale}`);
}

// ───────────────────────── Settings ─────────────────────────

export async function updateSettings(adminId: string, input: SettingsInput) {
  const before = await db.platformSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  await db.platformSettings.update({ where: { id: 1 }, data: input });
  const changed = Object.fromEntries(
    (Object.keys(input) as (keyof SettingsInput)[]).filter((k) => before[k] !== input[k]).map((k) => [k, { from: before[k], to: input[k] }]),
  );
  await audit(db, adminId, "settings.update", "PlatformSettings", "1", changed);
}

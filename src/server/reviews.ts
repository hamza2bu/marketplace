import "server-only";
import { db } from "@/server/db";
import { revalidateProductPages } from "@/server/seller/products";

/** Re-derives a product's and its shop's rating from visible reviews. */
export async function recomputeRatings(productId: string) {
  const product = await db.product.findUnique({ where: { id: productId }, select: { shopId: true } });
  if (!product) return;
  const [forProduct, forShop] = await Promise.all([
    db.review.aggregate({ where: { productId, status: "VISIBLE" }, _avg: { rating: true }, _count: { _all: true } }),
    db.review.aggregate({ where: { product: { shopId: product.shopId }, status: "VISIBLE" }, _avg: { rating: true }, _count: { _all: true } }),
  ]);
  await db.$transaction([
    db.product.update({ where: { id: productId }, data: { ratingAvg: forProduct._avg.rating ?? 0, ratingCount: forProduct._count._all } }),
    db.shop.update({ where: { id: product.shopId }, data: { ratingAvg: forShop._avg.rating ?? 0, ratingCount: forShop._count._all } }),
  ]);
}

async function afterChange(productId: string) {
  await recomputeRatings(productId);
  const product = await db.product.findUnique({ where: { id: productId }, select: { slug: true } });
  if (product) revalidateProductPages([product.slug]);
}

export type ReviewError = "not_found" | "not_allowed" | "own";
export type ReviewInput = { rating: number; title?: string; body: string };

/**
 * Creates or updates the buyer's review of an order item. Verified buyers
 * only: the item must be theirs and delivered.
 */
export async function saveReview(userId: string, orderItemId: string, input: ReviewInput): Promise<{ ok: boolean; error?: ReviewError }> {
  const item = await db.orderItem.findFirst({
    where: { id: orderItemId, subOrder: { order: { customerId: userId } } },
    select: { productId: true, subOrder: { select: { status: true } }, review: { select: { id: true } } },
  });
  if (!item) return { ok: false, error: "not_found" };
  if (!["DELIVERED", "RETURN_REQUESTED", "RETURNED"].includes(item.subOrder.status)) return { ok: false, error: "not_allowed" };
  const product = await db.product.findUnique({ where: { id: item.productId }, select: { id: true } });
  if (!product) return { ok: false, error: "not_found" };

  const data = { rating: input.rating, title: input.title || null, body: input.body };
  if (item.review) await db.review.update({ where: { id: item.review.id }, data });
  else await db.review.create({ data: { ...data, productId: item.productId, userId, orderItemId } });
  await afterChange(item.productId);
  return { ok: true };
}

export async function deleteOwnReview(userId: string, reviewId: string) {
  const review = await db.review.findFirst({ where: { id: reviewId, userId }, select: { productId: true } });
  if (!review) return { ok: false as const };
  await db.review.delete({ where: { id: reviewId } });
  await afterChange(review.productId);
  return { ok: true as const };
}

/** A shopper reports a review. It stays up; the admin queue decides. */
export async function flagReview(userId: string, reviewId: string, reason: string): Promise<{ ok: boolean; error?: ReviewError }> {
  const review = await db.review.findUnique({ where: { id: reviewId }, select: { userId: true, status: true } });
  if (!review || review.status !== "VISIBLE") return { ok: false, error: "not_found" };
  if (review.userId === userId) return { ok: false, error: "own" };
  await db.review.update({ where: { id: reviewId }, data: { flaggedAt: new Date(), flagReason: reason } });
  return { ok: true };
}

/** The shop's public answer under a review of one of its products. Empty text removes it. */
export async function replyToReview(shopId: string, reviewId: string, reply: string) {
  const review = await db.review.findFirst({ where: { id: reviewId, product: { shopId } }, select: { productId: true } });
  if (!review) return { ok: false as const };
  await db.review.update({ where: { id: reviewId }, data: { sellerReply: reply || null } });
  await afterChange(review.productId);
  return { ok: true as const };
}

export async function getShopReviews(shopId: string, page: number, pageSize = 20) {
  const where = { product: { shopId }, status: "VISIBLE" as const };
  const [reviews, total] = await Promise.all([
    db.review.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { product: { select: { title: true, slug: true } }, user: { select: { name: true } } },
    }),
    db.review.count({ where }),
  ]);
  return { reviews, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

import "server-only";
import { db } from "@/server/db";

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

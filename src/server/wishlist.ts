import "server-only";
import { db } from "@/server/db";

export async function isSaved(userId: string, productId: string) {
  return (await db.wishlistItem.count({ where: { userId, productId } })) > 0;
}

/** Saves or un-saves a product. Returns whether it's saved now. */
export async function toggleSaved(userId: string, productId: string): Promise<boolean | null> {
  const product = await db.product.findFirst({ where: { id: productId, status: "ACTIVE" }, select: { id: true } });
  const existing = await db.wishlistItem.findUnique({ where: { userId_productId: { userId, productId } } });
  if (existing) {
    await db.wishlistItem.delete({ where: { userId_productId: { userId, productId } } });
    return false;
  }
  if (!product) return null;
  if ((await db.wishlistItem.count({ where: { userId } })) >= 200) return null;
  await db.wishlistItem.create({ data: { userId, productId } });
  return true;
}

export async function savedProductIds(userId: string) {
  return (await db.wishlistItem.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, select: { productId: true } })).map((w) => w.productId);
}

import "server-only";
import { db } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import { effectivePrice, type DiscountRule } from "@/lib/pricing";

/** Prisma filter for discounts that apply right now. */
export function liveDiscountWhere(now: Date): Prisma.DiscountWhereInput {
  return { isActive: true, startsAt: { lte: now }, endsAt: { gt: now } };
}

/** Select for a shop's live shop-wide discounts plus a product's own, to nest in product queries. */
export function discountSelects(now: Date) {
  const select = { type: true, value: true, productId: true, startsAt: true, endsAt: true, isActive: true } as const;
  return {
    product: { where: liveDiscountWhere(now), select },
    shop: { where: { ...liveDiscountWhere(now), productId: null }, select },
  };
}

/**
 * Re-derives a product's listing price (lowest price after discounts) and
 * deal flag, which search and sorting use. Call after changing variants or
 * discounts; the cron job calls it when discounts start or end.
 */
export async function refreshProductPricing(where: { productIds?: string[]; shopIds?: string[] }, now = new Date()) {
  const or: Prisma.ProductWhereInput[] = [];
  if (where.productIds?.length) or.push({ id: { in: where.productIds } });
  if (where.shopIds?.length) or.push({ shopId: { in: where.shopIds } });
  if (or.length === 0) return 0;

  const { product, shop } = discountSelects(now);
  const products = await db.product.findMany({
    where: { OR: or },
    select: {
      id: true,
      minPriceMinor: true,
      hasDeal: true,
      discounts: product,
      shop: { select: { discounts: shop } },
      variants: { where: { isActive: true }, select: { priceMinor: true, compareAtMinor: true } },
    },
  });

  let changed = 0;
  for (const p of products) {
    const rules: DiscountRule[] = [...p.discounts, ...p.shop.discounts];
    const prices = p.variants.map((v) => effectivePrice(v, p.id, rules, now));
    const minPriceMinor = prices.length ? Math.min(...prices.map((x) => x.priceMinor)) : 0;
    const hasDeal = prices.some((x) => x.compareAtMinor !== null);
    if (minPriceMinor !== p.minPriceMinor || hasDeal !== p.hasDeal) {
      await db.product.update({ where: { id: p.id }, data: { minPriceMinor, hasDeal } });
      changed++;
    }
  }
  return changed;
}

/** Refreshes products whose discounts started or ended in the last `windowMinutes`. */
export async function refreshDiscountBoundaries(now = new Date(), windowMinutes = 15) {
  const since = new Date(now.getTime() - windowMinutes * 60_000);
  const discounts = await db.discount.findMany({
    where: { OR: [{ startsAt: { gt: since, lte: now } }, { endsAt: { gt: since, lte: now } }] },
    select: { productId: true, shopId: true },
  });
  return refreshProductPricing(
    {
      productIds: discounts.flatMap((d) => (d.productId ? [d.productId] : [])),
      shopIds: discounts.flatMap((d) => (d.productId ? [] : [d.shopId])),
    },
    now,
  );
}

import "server-only";
import { db } from "@/server/db";

export const RANGES = [7, 30, 90] as const;
export type RangeDays = (typeof RANGES)[number];

const TZ = "Asia/Jerusalem";

/** Money summary for a period, from the ledger (so refunds and commission are exact). */
export async function salesSummary(shopId: string, days: RangeDays, now = new Date()) {
  const since = new Date(now.getTime() - days * 86_400_000);
  const [byType, orders, units] = await Promise.all([
    db.ledgerEntry.groupBy({ by: ["type"], where: { shopId, createdAt: { gte: since } }, _sum: { amountMinor: true } }),
    db.subOrder.count({ where: { shopId, order: { paidAt: { gte: since } } } }),
    db.orderItem.aggregate({ where: { subOrder: { shopId, order: { paidAt: { gte: since } } } }, _sum: { quantity: true } }),
  ]);
  const sum = (type: string) => byType.find((g) => g.type === type)?._sum.amountMinor ?? 0;
  const gross = sum("SALE");
  const commission = -sum("COMMISSION") || 0; // net of commission returned on refunds
  const refunds = -sum("REFUND") || 0;
  return {
    grossMinor: gross,
    commissionMinor: commission,
    refundsMinor: refunds,
    netMinor: gross - commission - refunds,
    orders,
    units: units._sum.quantity ?? 0,
  };
}

/** Gross sales per day (Israel time), with empty days filled in. */
export async function dailySales(shopId: string, days: RangeDays, now = new Date()) {
  const since = new Date(now.getTime() - days * 86_400_000);
  const rows = await db.$queryRaw<{ day: string; amount: bigint }[]>`
    SELECT to_char(date_trunc('day', "createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${TZ}), 'YYYY-MM-DD') AS day,
           SUM("amountMinor")::bigint AS amount
    FROM "LedgerEntry"
    WHERE "shopId" = ${shopId} AND type = 'SALE' AND "createdAt" >= ${since}
    GROUP BY 1`;
  const byDay = new Map(rows.map((r) => [r.day, Number(r.amount)]));
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
  return Array.from({ length: days }, (_, i) => {
    const day = fmt.format(new Date(now.getTime() - (days - 1 - i) * 86_400_000));
    return { day, amountMinor: byDay.get(day) ?? 0 };
  });
}

export async function topProducts(shopId: string, days: RangeDays, now = new Date()) {
  const since = new Date(now.getTime() - days * 86_400_000);
  const groups = await db.orderItem.groupBy({
    by: ["productId"],
    where: { subOrder: { shopId, order: { paidAt: { gte: since } }, status: { notIn: ["CANCELLED", "REFUNDED"] } } },
    _sum: { quantity: true, lineTotalMinor: true },
    orderBy: { _sum: { lineTotalMinor: "desc" } },
    take: 5,
  });
  const products = await db.product.findMany({ where: { id: { in: groups.map((g) => g.productId) } }, select: { id: true, title: true, slug: true } });
  return groups.map((g) => ({
    product: products.find((p) => p.id === g.productId),
    units: g._sum.quantity ?? 0,
    revenueMinor: g._sum.lineTotalMinor ?? 0,
  }));
}

/**
 * Where the seller's money is:
 * - held: paid orders still within delivery + return window
 * - available: released and not yet paid out
 * - paidOut: total transferred to the seller so far
 */
export async function balances(shopId: string) {
  const [held, released, payouts, adjustments] = await Promise.all([
    db.ledgerEntry.aggregate({ where: { shopId, subOrder: { transferStatus: "HELD" } }, _sum: { amountMinor: true } }),
    db.ledgerEntry.aggregate({ where: { shopId, subOrder: { transferStatus: { in: ["RELEASED", "SENT"] } } }, _sum: { amountMinor: true } }),
    db.ledgerEntry.aggregate({ where: { shopId, type: "PAYOUT" }, _sum: { amountMinor: true } }),
    db.ledgerEntry.aggregate({ where: { shopId, subOrderId: null, type: { not: "PAYOUT" } }, _sum: { amountMinor: true } }),
  ]);
  // "|| 0" turns -0 into 0, so nothing renders as "−₪0.00".
  const paidOut = -(payouts._sum.amountMinor ?? 0) || 0;
  return {
    heldMinor: held._sum.amountMinor ?? 0,
    availableMinor: (released._sum.amountMinor ?? 0) + (adjustments._sum.amountMinor ?? 0) - paidOut,
    paidOutMinor: paidOut,
  };
}

/** Per-order commission breakdown for recent paid orders. */
export async function commissionBreakdown(shopId: string, take = 20) {
  const subOrders = await db.subOrder.findMany({
    where: { shopId, order: { paidAt: { not: null } } },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      status: true,
      transferStatus: true,
      subtotalMinor: true,
      shippingMinor: true,
      commissionMinor: true,
      sellerNetMinor: true,
      order: { select: { number: true, paidAt: true } },
      items: { select: { titleSnapshot: true, quantity: true, lineTotalMinor: true, commissionBps: true } },
    },
  });
  return subOrders;
}

/** The commission rate that applies today in each category the shop sells in. */
export async function currentRates(shopId: string) {
  const [shop, settings, categories] = await Promise.all([
    db.shop.findUniqueOrThrow({ where: { id: shopId }, select: { commissionBpsOverride: true } }),
    db.platformSettings.findUnique({ where: { id: 1 } }),
    db.category.findMany({ select: { id: true, parentId: true, name: true, commissionBps: true, children: { select: { id: true } } } }),
  ]);
  const byId = new Map(categories.map((c) => [c.id, c]));
  const globalBps = settings?.globalCommissionBps ?? 1000;
  return categories
    .filter((c) => c.children.length === 0)
    .map((c) => {
      let bps = shop.commissionBpsOverride;
      for (let node: typeof c | undefined = c; bps === null && node; node = node.parentId ? byId.get(node.parentId) : undefined) {
        bps = node.commissionBps;
      }
      return { id: c.id, name: c.name, parentName: c.parentId ? byId.get(c.parentId)?.name : null, bps: bps ?? globalBps };
    });
}

export async function payoutHistory(shopId: string) {
  return db.payout.findMany({ where: { shopId }, orderBy: { createdAt: "desc" }, take: 50 });
}

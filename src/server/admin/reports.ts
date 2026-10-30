import "server-only";
import { db } from "@/server/db";

export const REPORT_RANGES = [7, 30, 90, 365] as const;
export type ReportDays = (typeof REPORT_RANGES)[number];
const TZ = "Asia/Jerusalem";

const sinceFor = (days: number, now: Date) => new Date(now.getTime() - days * 86_400_000);

/** Platform revenue for a period. Commission is net of commission returned on refunds. */
export async function platformSummary(days: ReportDays, now = new Date()) {
  const since = sinceFor(days, now);
  const [orders, commission, refunds, newCustomers, newShops] = await Promise.all([
    db.order.aggregate({ where: { paidAt: { gte: since } }, _sum: { totalMinor: true }, _count: { _all: true } }),
    db.ledgerEntry.aggregate({ where: { type: "COMMISSION", createdAt: { gte: since } }, _sum: { amountMinor: true } }),
    db.refund.aggregate({ where: { status: "SUCCEEDED", createdAt: { gte: since } }, _sum: { amountMinor: true } }),
    db.user.count({ where: { role: "CUSTOMER", createdAt: { gte: since } } }),
    db.shop.count({ where: { createdAt: { gte: since } } }),
  ]);
  const gmv = orders._sum.totalMinor ?? 0;
  const count = orders._count._all;
  return {
    gmvMinor: gmv,
    orders: count,
    averageOrderMinor: count ? Math.round(gmv / count) : 0,
    commissionMinor: -(commission._sum.amountMinor ?? 0) || 0,
    refundsMinor: refunds._sum.amountMinor ?? 0,
    newCustomers,
    newShops,
  };
}

/** Daily totals (Israel time) for one ledger type, with empty days filled in. Signs are flipped for commission. */
export async function dailySeries(kind: "gmv" | "commission", days: ReportDays, now = new Date()) {
  const since = sinceFor(days, now);
  const rows =
    kind === "gmv"
      ? await db.$queryRaw<{ day: string; amount: bigint }[]>`
          SELECT to_char(date_trunc('day', "paidAt" AT TIME ZONE 'UTC' AT TIME ZONE ${TZ}), 'YYYY-MM-DD') AS day, SUM("totalMinor")::bigint AS amount
          FROM "Order" WHERE "paidAt" >= ${since} GROUP BY 1`
      : await db.$queryRaw<{ day: string; amount: bigint }[]>`
          SELECT to_char(date_trunc('day', "createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${TZ}), 'YYYY-MM-DD') AS day, (-SUM("amountMinor"))::bigint AS amount
          FROM "LedgerEntry" WHERE type = 'COMMISSION' AND "createdAt" >= ${since} GROUP BY 1`;
  const byDay = new Map(rows.map((r) => [r.day, Number(r.amount)]));
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
  return Array.from({ length: days }, (_, i) => {
    const day = fmt.format(new Date(now.getTime() - (days - 1 - i) * 86_400_000));
    return { day, amountMinor: Math.max(0, byDay.get(day) ?? 0) };
  });
}

export async function topShops(days: ReportDays, now = new Date()) {
  const since = sinceFor(days, now);
  const rows = await db.$queryRaw<{ shopId: string; sales: bigint; commission: bigint }[]>`
    SELECT "shopId",
           SUM(CASE WHEN type = 'SALE' THEN "amountMinor" ELSE 0 END)::bigint AS sales,
           (-SUM(CASE WHEN type = 'COMMISSION' THEN "amountMinor" ELSE 0 END))::bigint AS commission
    FROM "LedgerEntry" WHERE "createdAt" >= ${since} AND type IN ('SALE', 'COMMISSION')
    GROUP BY "shopId" ORDER BY sales DESC LIMIT 10`;
  const shops = await db.shop.findMany({ where: { id: { in: rows.map((r) => r.shopId) } }, select: { id: true, name: true } });
  return rows.map((r) => ({ shop: shops.find((s) => s.id === r.shopId), salesMinor: Number(r.sales), commissionMinor: Number(r.commission) }));
}

/** Item sales and commission per top-level category. */
export async function byCategory(days: ReportDays, now = new Date()) {
  const since = sinceFor(days, now);
  const rows = await db.$queryRaw<{ categoryId: string; sales: bigint; commission: bigint }[]>`
    SELECT COALESCE(c."parentId", c.id) AS "categoryId",
           SUM(i."lineTotalMinor")::bigint AS sales,
           SUM(ROUND(i."lineTotalMinor" * i."commissionBps" / 10000.0))::bigint AS commission
    FROM "OrderItem" i
    JOIN "SubOrder" s ON s.id = i."subOrderId"
    JOIN "Order" o ON o.id = s."orderId"
    JOIN "Product" p ON p.id = i."productId"
    JOIN "Category" c ON c.id = p."categoryId"
    WHERE o."paidAt" >= ${since}
    GROUP BY 1 ORDER BY sales DESC`;
  const categories = await db.category.findMany({ where: { id: { in: rows.map((r) => r.categoryId) } }, select: { id: true, name: true } });
  return rows.map((r) => ({ name: categories.find((c) => c.id === r.categoryId)?.name, salesMinor: Number(r.sales), commissionMinor: Number(r.commission) }));
}

/** One row per paid sub-order in the period, for accounting. */
export async function subOrderLedgerRows(days: ReportDays, now = new Date()) {
  const since = sinceFor(days, now);
  return db.subOrder.findMany({
    where: { order: { paidAt: { gte: since } } },
    orderBy: { createdAt: "asc" },
    select: {
      status: true,
      transferStatus: true,
      subtotalMinor: true,
      shippingMinor: true,
      commissionMinor: true,
      sellerNetMinor: true,
      order: { select: { number: true, paidAt: true } },
      shop: { select: { name: true, taxId: true } },
      refunds: { where: { status: "SUCCEEDED" }, select: { amountMinor: true } },
    },
  });
}

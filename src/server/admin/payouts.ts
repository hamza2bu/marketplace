import "server-only";
import { db } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import { audit, queueEmail } from "./audit";

/** Money a shop can be paid now: released sales (net of their refunds) plus adjustments, minus payouts. */
async function availableByShop(tx: Prisma.TransactionClient | typeof db, shopId?: string) {
  const rows = await tx.$queryRaw<{ shopId: string; available: bigint }[]>`
    SELECT l."shopId", SUM(l."amountMinor")::bigint AS available
    FROM "LedgerEntry" l
    LEFT JOIN "SubOrder" s ON s.id = l."subOrderId"
    WHERE (l."subOrderId" IS NULL OR s."transferStatus" IN ('RELEASED', 'SENT'))
      AND (${shopId ?? null}::text IS NULL OR l."shopId" = ${shopId ?? null})
    GROUP BY l."shopId"`;
  return new Map(rows.map((r) => [r.shopId, Number(r.available)]));
}

export async function payableShops() {
  const available = await availableByShop(db);
  const ids = [...available].filter(([, amount]) => amount > 0).map(([id]) => id);
  const shops = await db.shop.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, slug: true, status: true, payoutBankLast4: true, legalName: true },
  });
  return shops.map((s) => ({ ...s, availableMinor: available.get(s.id) ?? 0 })).sort((a, b) => b.availableMinor - a.availableMinor);
}

export async function recentPayouts() {
  return db.payout.findMany({ orderBy: { createdAt: "desc" }, take: 50, include: { shop: { select: { name: true } } } });
}

export type PayoutError = "nothing_to_pay" | "no_bank_account";

/**
 * Records that the shop's whole available balance was transferred to its
 * bank account (the transfer itself is done in the bank, with `reference`).
 */
export async function recordPayout(adminId: string, shopId: string, reference: string): Promise<{ ok: true; amountMinor: number } | { ok: false; error: PayoutError }> {
  return db.$transaction(async (tx) => {
    // Lock the shop row so two admins can't pay the same balance twice.
    await tx.$queryRaw`SELECT id FROM "Shop" WHERE id = ${shopId} FOR UPDATE`;
    const shop = await tx.shop.findUnique({ where: { id: shopId }, select: { payoutBankEncrypted: true, contactEmail: true, ownerId: true } });
    if (!shop?.payoutBankEncrypted) return { ok: false as const, error: "no_bank_account" as const };
    const amount = (await availableByShop(tx, shopId)).get(shopId) ?? 0;
    if (amount <= 0) return { ok: false as const, error: "nothing_to_pay" as const };

    const payout = await tx.payout.create({ data: { shopId, amountMinor: amount, status: "PAID", paidAt: new Date(), providerRefs: [reference] } });
    await tx.ledgerEntry.create({ data: { shopId, type: "PAYOUT", amountMinor: -amount, note: `payout ${payout.id} ${reference}` } });
    await tx.subOrder.updateMany({ where: { shopId, transferStatus: "RELEASED" }, data: { transferStatus: "SENT" } });
    await audit(tx, adminId, "payout.recorded", "Shop", shopId, { payoutId: payout.id, amountMinor: amount, reference });
    await queueEmail(tx, shop.contactEmail, shop.ownerId, "payout-sent", { amountMinor: amount, reference });
    return { ok: true as const, amountMinor: amount };
  });
}

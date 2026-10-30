import "server-only";
import { db } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import type { ShopStatus } from "@/generated/prisma/enums";
import { decryptJson } from "@/server/crypto";
import { balances } from "@/server/seller/analytics";
import { revalidateProductPages } from "@/server/seller/products";
import type { BankAccount } from "@/lib/validation/seller";
import { audit, queueEmail } from "./audit";

/** Which status changes an admin can make. A removed shop stays removed. */
export const SHOP_TRANSITIONS: Record<ShopStatus, ShopStatus[]> = {
  PENDING: ["APPROVED", "REMOVED"],
  APPROVED: ["SUSPENDED", "REMOVED"],
  SUSPENDED: ["APPROVED", "REMOVED"],
  REMOVED: [],
};

const OPEN_SUB_ORDER: Prisma.SubOrderWhereInput = { status: { in: ["PAID", "PROCESSING", "SHIPPED", "RETURN_REQUESTED"] } };

export async function listShops(opts: { status?: ShopStatus; q?: string; page: number; pageSize?: number }) {
  const pageSize = opts.pageSize ?? 25;
  const where: Prisma.ShopWhereInput = {
    ...(opts.status ? { status: opts.status } : {}),
    ...(opts.q
      ? { OR: [{ name: { contains: opts.q, mode: "insensitive" } }, { slug: { contains: opts.q.toLowerCase() } }, { owner: { email: { contains: opts.q.toLowerCase() } } }] }
      : {}),
  };
  const [shops, total] = await Promise.all([
    db.shop.findMany({
      where,
      // Pending applications first, oldest first: that's the review queue.
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      skip: (opts.page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        createdAt: true,
        commissionBpsOverride: true,
        owner: { select: { email: true, name: true } },
        _count: { select: { products: true, subOrders: true } },
      },
    }),
    db.shop.count({ where }),
  ]);
  return { shops, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getShopForAdmin(id: string) {
  const shop = await db.shop.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, email: true, name: true, status: true, createdAt: true } },
      _count: { select: { products: true, subOrders: true } },
    },
  });
  if (!shop) return null;
  const [money, openOrders, history] = await Promise.all([
    balances(shop.id),
    db.subOrder.count({ where: { shopId: shop.id, ...OPEN_SUB_ORDER } }),
    db.auditLog.findMany({ where: { entity: "Shop", entityId: shop.id }, orderBy: { createdAt: "desc" }, take: 20, include: { actor: { select: { email: true } } } }),
  ]);
  return { ...shop, money, openOrders, history };
}

export type ShopActionError = "not_found" | "not_allowed" | "open_orders";

export async function setShopStatus(adminId: string, shopId: string, to: ShopStatus, reason: string): Promise<{ ok: boolean; error?: ShopActionError }> {
  const shop = await db.shop.findUnique({ where: { id: shopId }, select: { id: true, status: true, contactEmail: true, ownerId: true } });
  if (!shop) return { ok: false, error: "not_found" };
  if (!SHOP_TRANSITIONS[shop.status].includes(to)) return { ok: false, error: "not_allowed" };
  // Customers' paid orders must be finished (or refunded) before a shop goes away.
  if (to === "REMOVED" && (await db.subOrder.count({ where: { shopId, ...OPEN_SUB_ORDER } })) > 0) return { ok: false, error: "open_orders" };

  await db.$transaction(async (tx) => {
    const { count } = await tx.shop.updateMany({
      where: { id: shopId, status: shop.status },
      data: { status: to, statusReason: reason || null, ...(to === "APPROVED" ? { approvedAt: new Date() } : {}) },
    });
    if (count === 0) return;
    await audit(tx, adminId, `shop.${to.toLowerCase()}`, "Shop", shopId, { from: shop.status, reason });
    await queueEmail(tx, shop.contactEmail, shop.ownerId, `shop-${to.toLowerCase()}`, { reason });
  });
  await revalidateShopPages(shopId);
  return { ok: true };
}

export async function setShopCommission(adminId: string, shopId: string, bps: number | null) {
  const shop = await db.shop.findUnique({ where: { id: shopId }, select: { commissionBpsOverride: true } });
  if (!shop) return { ok: false as const };
  await db.shop.update({ where: { id: shopId }, data: { commissionBpsOverride: bps } });
  await audit(db, adminId, "shop.commission", "Shop", shopId, { from: shop.commissionBpsOverride, to: bps });
  return { ok: true as const };
}

/** Shows the full payout bank account to an admin (for paying the seller). Always audit-logged. */
export async function revealBankAccount(adminId: string, shopId: string): Promise<BankAccount | null> {
  const shop = await db.shop.findUnique({ where: { id: shopId }, select: { payoutBankEncrypted: true } });
  if (!shop?.payoutBankEncrypted) return null;
  await audit(db, adminId, "shop.bank_viewed", "Shop", shopId);
  return decryptJson<BankAccount>(shop.payoutBankEncrypted);
}

/** A shop's visibility changed: refresh its products, storefront and the home page. */
async function revalidateShopPages(shopId: string) {
  const products = await db.product.findMany({ where: { shopId }, select: { slug: true } });
  revalidateProductPages(products.map((p) => p.slug));
}

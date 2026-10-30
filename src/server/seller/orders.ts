import "server-only";
import { db } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import type { SubOrderStatus } from "@/generated/prisma/enums";
import { SELLER_TRANSITIONS } from "@/lib/order-status";
import { getPlatformSettings } from "@/server/settings";
import { refundSubOrder, RefundError, syncOrderStatus } from "@/server/payments/service";
import { addDisputeMessage } from "@/server/admin/orders";
import { queueEmail } from "@/server/email";

export type SellerOrderError = "not_found" | "not_allowed" | "refund_failed" | "invalid_amount";

export async function getSellerSubOrders(shopId: string, opts: { status?: SubOrderStatus; page: number; pageSize?: number }) {
  const pageSize = opts.pageSize ?? 20;
  // Unpaid orders aren't the seller's business yet.
  const where: Prisma.SubOrderWhereInput = { shopId, order: { paidAt: { not: null } }, ...(opts.status ? { status: opts.status } : {}) };
  const [subOrders, total] = await Promise.all([
    db.subOrder.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (opts.page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        status: true,
        subtotalMinor: true,
        shippingMinor: true,
        sellerNetMinor: true,
        createdAt: true,
        order: { select: { number: true, paidAt: true, shippingAddress: true } },
        _count: { select: { items: true } },
      },
    }),
    db.subOrder.count({ where }),
  ]);
  return { subOrders, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getSellerSubOrder(shopId: string, id: string) {
  return db.subOrder.findFirst({
    where: { id, shopId, order: { paidAt: { not: null } } },
    include: {
      order: { select: { number: true, paidAt: true, shippingAddress: true, customer: { select: { name: true } } } },
      items: true,
      events: { orderBy: { createdAt: "asc" } },
      returnRequests: { orderBy: { createdAt: "desc" } },
      refunds: { where: { status: "SUCCEEDED" }, select: { amountMinor: true, reason: true, createdAt: true } },
      disputes: { orderBy: { createdAt: "desc" }, select: { id: true, status: true, messages: true } },
    },
  });
}

/** The seller's side of a dispute about one of their orders. */
export async function sellerDisputeReply(shopId: string, disputeId: string, text: string, actorId: string) {
  const dispute = await db.dispute.findFirst({ where: { id: disputeId, subOrder: { shopId } }, select: { id: true } });
  if (!dispute) return { ok: false as const };
  return addDisputeMessage(dispute.id, "seller", text, actorId);
}

/** Counts for the dashboard's "needs your attention" list. */
export async function sellerActionCounts(shopId: string) {
  const [toProcess, toShip, returns] = await Promise.all([
    db.subOrder.count({ where: { shopId, status: "PAID" } }),
    db.subOrder.count({ where: { shopId, status: "PROCESSING" } }),
    db.returnRequest.count({ where: { subOrder: { shopId }, status: { in: ["REQUESTED", "APPROVED"] } } }),
  ]);
  return { toProcess, toShip, returns };
}

async function notifyCustomer(tx: Prisma.TransactionClient, subOrderId: string, template: string, extra: Prisma.InputJsonObject = {}) {
  const sub = await tx.subOrder.findUniqueOrThrow({
    where: { id: subOrderId },
    select: { order: { select: { number: true, customer: { select: { id: true, email: true } } } } },
  });
  await queueEmail(tx, { to: sub.order.customer.email, userId: sub.order.customer.id, template, payload: { orderNumber: sub.order.number, subOrderId, ...extra } });
}

/**
 * Moves a sub-order forward: PAID → PROCESSING → SHIPPED (with tracking) →
 * DELIVERED. Delivery starts the return window; the seller's money is
 * released when it ends.
 */
export async function advanceSubOrder(
  shopId: string,
  subOrderId: string,
  to: SubOrderStatus,
  actorId: string,
  shipment?: { carrier: string; trackingNumber: string },
): Promise<{ ok: boolean; error?: SellerOrderError }> {
  const sub = await db.subOrder.findFirst({ where: { id: subOrderId, shopId }, select: { id: true, status: true, orderId: true } });
  if (!sub) return { ok: false, error: "not_found" };
  if (!SELLER_TRANSITIONS[sub.status]?.includes(to)) return { ok: false, error: "not_allowed" };
  if (to === "SHIPPED" && !shipment) return { ok: false, error: "not_allowed" };

  const settings = await getPlatformSettings();
  const now = new Date();
  const data: Prisma.SubOrderUpdateManyMutationInput = { status: to };
  if (to === "SHIPPED") Object.assign(data, { shippedAt: now, carrier: shipment!.carrier, trackingNumber: shipment!.trackingNumber });
  if (to === "DELIVERED") Object.assign(data, { deliveredAt: now, releaseAt: new Date(now.getTime() + settings.returnWindowDays * 86_400_000) });

  const ok = await db.$transaction(async (tx) => {
    // Conditional on the current status, so two clicks can't both apply.
    const { count } = await tx.subOrder.updateMany({ where: { id: sub.id, status: sub.status }, data });
    if (count === 0) return false;
    await tx.orderEvent.create({
      data: { subOrderId: sub.id, status: to, actorId, note: shipment ? `${shipment.carrier} ${shipment.trackingNumber}` : undefined },
    });
    await syncOrderStatus(tx, sub.orderId);
    if (to === "SHIPPED") await notifyCustomer(tx, sub.id, "order-shipped", { carrier: shipment!.carrier, trackingNumber: shipment!.trackingNumber });
    if (to === "DELIVERED") await notifyCustomer(tx, sub.id, "order-delivered");
    return true;
  });
  return ok ? { ok: true } : { ok: false, error: "not_allowed" };
}

/** The seller can't fulfil it: cancel before shipping, refund in full and restock. */
export async function cancelBySeller(shopId: string, subOrderId: string, reason: string, actorId: string) {
  const sub = await db.subOrder.findFirst({ where: { id: subOrderId, shopId }, select: { status: true } });
  if (!sub) return { ok: false, error: "not_found" as const };
  if (sub.status !== "PAID" && sub.status !== "PROCESSING") return { ok: false, error: "not_allowed" as const };
  try {
    await refundSubOrder({ subOrderId, reason: `seller_cancelled: ${reason}`, actorId, restock: true, finalStatus: "CANCELLED" });
    return { ok: true };
  } catch (error) {
    if (error instanceof RefundError) return { ok: false, error: error.code === "provider_failed" ? ("refund_failed" as const) : ("not_allowed" as const) };
    throw error;
  }
}

// ───────────────────────── Returns ─────────────────────────

export async function getSellerReturns(shopId: string) {
  return db.returnRequest.findMany({
    where: { subOrder: { shopId } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 100,
    include: {
      subOrder: {
        select: {
          id: true,
          status: true,
          subtotalMinor: true,
          shippingMinor: true,
          order: { select: { number: true } },
          refunds: { where: { status: { in: ["PENDING", "SUCCEEDED"] } }, select: { amountMinor: true } },
        },
      },
    },
  });
}

/**
 * Seller's decision on a return request.
 * - approve: the customer can send it back.
 * - reject: back to delivered; the money is released when the return window ends.
 * - refund: the item came back; refund (in full by default) and optionally restock.
 */
export async function decideReturn(
  shopId: string,
  returnId: string,
  decision: { action: "approve" } | { action: "reject"; note: string } | { action: "refund"; amountMinor?: number; restock: boolean },
  actorId: string,
): Promise<{ ok: boolean; error?: SellerOrderError }> {
  const request = await db.returnRequest.findFirst({
    where: { id: returnId, subOrder: { shopId } },
    include: { subOrder: { select: { id: true, orderId: true, subtotalMinor: true, shippingMinor: true } } },
  });
  if (!request) return { ok: false, error: "not_found" };

  if (decision.action === "approve" || decision.action === "reject") {
    if (request.status !== "REQUESTED") return { ok: false, error: "not_allowed" };
    await db.$transaction(async (tx) => {
      await tx.returnRequest.update({
        where: { id: request.id },
        data: { status: decision.action === "approve" ? "APPROVED" : "REJECTED", sellerNote: decision.action === "reject" ? decision.note : null },
      });
      if (decision.action === "reject") {
        await tx.subOrder.update({ where: { id: request.subOrder.id }, data: { status: "DELIVERED" } });
        await tx.orderEvent.create({ data: { subOrderId: request.subOrder.id, status: "DELIVERED", note: `return_rejected: ${decision.note}`, actorId } });
        await syncOrderStatus(tx, request.subOrder.orderId);
      }
      await notifyCustomer(tx, request.subOrder.id, decision.action === "approve" ? "return-approved" : "return-rejected");
    });
    return { ok: true };
  }

  if (request.status !== "REQUESTED" && request.status !== "APPROVED") return { ok: false, error: "not_allowed" };
  const full = request.subOrder.subtotalMinor + request.subOrder.shippingMinor;
  const amount = decision.amountMinor ?? undefined;
  if (amount !== undefined && (amount <= 0 || amount > full)) return { ok: false, error: "invalid_amount" };
  try {
    const result = await refundSubOrder({
      subOrderId: request.subOrder.id,
      amountMinor: amount,
      reason: "return",
      actorId,
      restock: decision.restock,
    });
    await db.$transaction(async (tx) => {
      await tx.returnRequest.update({ where: { id: request.id }, data: { status: "REFUNDED" } });
      // A partial refund closes the return; the rest of the money stays the seller's.
      const sub = await tx.subOrder.findUniqueOrThrow({ where: { id: request.subOrder.id }, select: { status: true } });
      if (sub.status !== "REFUNDED") {
        await tx.subOrder.update({ where: { id: request.subOrder.id }, data: { status: "RETURNED" } });
        await tx.orderEvent.create({ data: { subOrderId: request.subOrder.id, status: "RETURNED", actorId, note: `refund:${result.refundMinor}` } });
      }
      await syncOrderStatus(tx, request.subOrder.orderId);
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof RefundError) return { ok: false, error: error.code === "provider_failed" ? "refund_failed" : "invalid_amount" };
    throw error;
  }
}

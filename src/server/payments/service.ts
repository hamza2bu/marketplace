import "server-only";
import { db } from "@/server/db";
import { Prisma } from "@/generated/prisma/client";
import type { SubOrderStatus } from "@/generated/prisma/enums";
import { deriveOrderStatus } from "@/lib/order-status";
import { splitRefund } from "@/lib/pricing";
import { providerById } from "./index";
import type { PaymentWebhookEvent } from "./types";

type Tx = Prisma.TransactionClient;

// ───────────────────────── Shared steps ─────────────────────────

/** Puts the stock of an order's items back. */
async function restockSubOrders(tx: Tx, subOrderIds: string[]) {
  const items = await tx.orderItem.findMany({ where: { subOrderId: { in: subOrderIds }, variantId: { not: null } } });
  for (const item of items) {
    await tx.productVariant.update({ where: { id: item.variantId! }, data: { stock: { increment: item.quantity } } });
  }
}

/** Recomputes the order's overall status from its sub-orders. */
export async function syncOrderStatus(tx: Tx, orderId: string) {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { status: true, subOrders: { select: { status: true } }, _count: { select: { refunds: { where: { status: "SUCCEEDED" } } } } },
  });
  const status = deriveOrderStatus(
    order.status,
    order.subOrders.map((s) => s.status),
    order._count.refunds > 0,
  );
  if (status !== order.status) await tx.order.update({ where: { id: orderId }, data: { status } });
}

async function addEvent(tx: Tx, subOrderIds: string[], status: SubOrderStatus, note?: string, actorId?: string) {
  await tx.orderEvent.createMany({ data: subOrderIds.map((subOrderId) => ({ subOrderId, status, note, actorId })) });
}

/** Records an email to send; delivery is wired up in Phase 6. */
async function queueEmail(tx: Tx, to: string, userId: string | null, template: string, payload: Prisma.InputJsonValue) {
  await tx.emailLog.create({ data: { to, userId, template, payload, status: "queued" } });
}

/**
 * Cancels an unpaid order and releases its stock. Returns false if the order
 * was no longer awaiting payment (e.g. it was paid in the meantime).
 */
export async function cancelUnpaidOrder(tx: Tx, orderId: string, note: string): Promise<boolean> {
  const { count } = await tx.order.updateMany({
    where: { id: orderId, status: "PENDING_PAYMENT" },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
  if (count === 0) return false;
  const subOrders = await tx.subOrder.findMany({ where: { orderId }, select: { id: true } });
  const ids = subOrders.map((s) => s.id);
  await tx.subOrder.updateMany({ where: { id: { in: ids } }, data: { status: "CANCELLED" } });
  await restockSubOrders(tx, ids);
  await addEvent(tx, ids, "CANCELLED", note);
  return true;
}

// ───────────────────────── Webhooks ─────────────────────────

export class UnknownProviderError extends Error {}

export type WebhookOutcome = "paid" | "failed" | "duplicate" | "ignored" | "refunded";

/** Verifies and applies a payment webhook. Each provider event is applied at most once. */
export async function handlePaymentWebhook(providerId: string, rawBody: string, headers: Headers): Promise<WebhookOutcome> {
  const provider = providerById(providerId);
  if (!provider) throw new UnknownProviderError(providerId);
  const event = await provider.parseWebhook(rawBody, headers);

  try {
    return await db.$transaction(async (tx) => {
      // Fails with P2002 if this event was already applied; that rolls everything back.
      await tx.paymentEvent.create({
        data: {
          provider: providerId,
          eventId: event.eventId,
          type: event.type,
          orderId: (await tx.order.findUnique({ where: { id: event.orderId }, select: { id: true } }))?.id,
          amountMinor: event.amountMinor,
          payload: event.raw as Prisma.InputJsonValue,
        },
      });
      return event.type === "payment.succeeded" ? applyPaymentSucceeded(tx, providerId, event) : applyPaymentFailed(tx, providerId, event);
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return "duplicate";
    if (error instanceof StockGoneError) return refundUnfulfillablePayment(providerId, event);
    throw error;
  }
}

class StockGoneError extends Error {}

async function applyPaymentSucceeded(tx: Tx, providerId: string, event: PaymentWebhookEvent): Promise<WebhookOutcome> {
  const order = await tx.order.findUnique({
    where: { id: event.orderId },
    include: {
      customer: { select: { id: true, email: true } },
      subOrders: { include: { items: true, shop: { select: { contactEmail: true, ownerId: true } } } },
    },
  });
  if (!order || order.paymentProvider !== providerId || order.paymentRef !== event.paymentRef) {
    await audit(tx, "payment.unmatched", "Order", event.orderId, { eventId: event.eventId, paymentRef: event.paymentRef });
    return "ignored";
  }
  if (event.amountMinor !== order.totalMinor || event.currency !== order.currency) {
    // Never mark an order paid for the wrong amount; an admin must look at it.
    await audit(tx, "payment.amount_mismatch", "Order", order.id, {
      expected: order.totalMinor,
      received: event.amountMinor,
      currency: event.currency,
    });
    return "ignored";
  }
  if (order.status !== "PENDING_PAYMENT" && order.status !== "CANCELLED") return "duplicate";

  if (order.status === "CANCELLED") {
    // Paid after the order expired and released its stock: take it back if we still can.
    for (const item of order.subOrders.flatMap((s) => s.items)) {
      if (!item.variantId) throw new StockGoneError();
      const { count } = await tx.productVariant.updateMany({
        where: { id: item.variantId, stock: { gte: item.quantity } },
        data: { stock: { decrement: item.quantity } },
      });
      if (count === 0) throw new StockGoneError();
    }
  }

  const now = new Date();
  await tx.order.update({
    where: { id: order.id },
    data: { status: "PAID", paidAt: now, expiresAt: null, cancelledAt: null },
  });
  const subOrderIds = order.subOrders.map((s) => s.id);
  await tx.subOrder.updateMany({ where: { id: { in: subOrderIds } }, data: { status: "PAID", transferStatus: "HELD" } });
  await addEvent(tx, subOrderIds, "PAID");

  await tx.ledgerEntry.createMany({
    data: order.subOrders.flatMap((s) => [
      { shopId: s.shopId, subOrderId: s.id, type: "SALE" as const, amountMinor: s.subtotalMinor + s.shippingMinor },
      { shopId: s.shopId, subOrderId: s.id, type: "COMMISSION" as const, amountMinor: -s.commissionMinor },
    ]),
  });

  const soldByProduct = new Map<string, number>();
  for (const item of order.subOrders.flatMap((s) => s.items)) {
    soldByProduct.set(item.productId, (soldByProduct.get(item.productId) ?? 0) + item.quantity);
  }
  for (const [productId, quantity] of soldByProduct) {
    await tx.product.updateMany({ where: { id: productId }, data: { salesCount: { increment: quantity } } });
  }

  // Remove what was bought from the customer's cart.
  const variantIds = order.subOrders.flatMap((s) => s.items.map((i) => i.variantId)).filter((id) => id !== null);
  await tx.cartItem.deleteMany({ where: { cart: { userId: order.customerId }, variantId: { in: variantIds } } });

  await queueEmail(tx, order.customer.email, order.customer.id, "order-confirmation", { orderNumber: order.number });
  for (const s of order.subOrders) {
    await queueEmail(tx, s.shop.contactEmail, s.shop.ownerId, "seller-new-order", { orderNumber: order.number, subOrderId: s.id });
  }
  return "paid";
}

async function applyPaymentFailed(tx: Tx, providerId: string, event: PaymentWebhookEvent): Promise<WebhookOutcome> {
  const order = await tx.order.findUnique({ where: { id: event.orderId }, select: { id: true, paymentRef: true, paymentProvider: true } });
  if (!order || order.paymentProvider !== providerId || order.paymentRef !== event.paymentRef) return "ignored";
  return (await cancelUnpaidOrder(tx, order.id, "payment_failed")) ? "failed" : "ignored";
}

/** A payment arrived for an expired order whose stock is gone: give the money back. */
async function refundUnfulfillablePayment(providerId: string, event: PaymentWebhookEvent): Promise<WebhookOutcome> {
  const provider = providerById(providerId)!;
  const { refundRef } = await provider.refund({ paymentRef: event.paymentRef, amountMinor: event.amountMinor, reason: "out_of_stock_after_expiry" });
  try {
    await db.$transaction(async (tx) => {
      await tx.paymentEvent.create({
        data: { provider: providerId, eventId: event.eventId, type: event.type, orderId: event.orderId, amountMinor: event.amountMinor, payload: event.raw as Prisma.InputJsonValue },
      });
      const order = await tx.order.update({
        where: { id: event.orderId },
        data: { status: "REFUNDED", paidAt: new Date() },
        select: { customerId: true },
      });
      await tx.refund.create({
        data: {
          orderId: event.orderId,
          amountMinor: event.amountMinor,
          reason: "out_of_stock_after_expiry",
          status: "SUCCEEDED",
          providerRef: refundRef,
          initiatedById: order.customerId,
        },
      });
      await audit(tx, "payment.refunded_after_expiry", "Order", event.orderId, { refundRef });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return "duplicate";
    throw error;
  }
  return "refunded";
}

async function audit(tx: Tx, action: string, entity: string, entityId: string, meta: Prisma.InputJsonValue, actorId?: string) {
  await tx.auditLog.create({ data: { action, entity, entityId, meta, actorId } });
}

// ───────────────────────── Refunds ─────────────────────────

export class RefundError extends Error {
  constructor(public code: "not_found" | "not_refundable" | "invalid_amount" | "provider_failed") {
    super(code);
  }
}

/**
 * Refunds part or all of one seller's part of an order through the payment
 * provider, and books it in the ledger. Pass `finalStatus` when the refund
 * closes the sub-order (cancelled before shipping, or returned).
 */
export async function refundSubOrder(input: {
  subOrderId: string;
  amountMinor?: number;
  reason: string;
  actorId: string;
  restock?: boolean;
  finalStatus?: "CANCELLED" | "REFUNDED";
}) {
  // Step 1: under a row lock, check what is refundable and reserve it.
  const pending = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "SubOrder" WHERE id = ${input.subOrderId} FOR UPDATE`;
    const subOrder = await tx.subOrder.findUnique({
      where: { id: input.subOrderId },
      include: { order: true, refunds: { where: { status: { in: ["PENDING", "SUCCEEDED"] } } } },
    });
    if (!subOrder) throw new RefundError("not_found");
    if (!subOrder.order.paymentRef || !subOrder.order.paymentProvider || !subOrder.order.paidAt) throw new RefundError("not_refundable");

    const refunded = subOrder.refunds.reduce((n, r) => n + r.amountMinor, 0);
    const paid = subOrder.subtotalMinor + subOrder.shippingMinor;
    const amount = input.amountMinor ?? paid - refunded;
    if (amount <= 0) throw new RefundError("not_refundable");
    let split;
    try {
      split = splitRefund(subOrder, refunded, amount);
    } catch {
      throw new RefundError("invalid_amount");
    }
    const refund = await tx.refund.create({
      data: { orderId: subOrder.orderId, subOrderId: subOrder.id, amountMinor: amount, reason: input.reason, initiatedById: input.actorId },
    });
    return { refund, split, subOrder, fullyRefunded: refunded + amount === paid };
  });

  // Step 2: ask the provider (outside any transaction: it's a network call).
  const provider = providerById(pending.subOrder.order.paymentProvider!);
  let refundRef: string;
  try {
    if (!provider) throw new Error("Provider unavailable");
    ({ refundRef } = await provider.refund({
      paymentRef: pending.subOrder.order.paymentRef!,
      amountMinor: pending.split.refundMinor,
      reason: input.reason,
    }));
  } catch (error) {
    await db.refund.update({ where: { id: pending.refund.id }, data: { status: "FAILED" } });
    console.error("[refund] provider refund failed", error);
    throw new RefundError("provider_failed");
  }

  // Step 3: book it.
  const { subOrder, split } = pending;
  await db.$transaction(async (tx) => {
    await tx.refund.update({ where: { id: pending.refund.id }, data: { status: "SUCCEEDED", providerRef: refundRef } });
    await tx.ledgerEntry.createMany({
      data: [
        { shopId: subOrder.shopId, subOrderId: subOrder.id, type: "REFUND", amountMinor: -split.refundMinor, note: input.reason },
        { shopId: subOrder.shopId, subOrderId: subOrder.id, type: "COMMISSION", amountMinor: split.commissionReturnedMinor, note: "refund" },
      ],
    });
    const data: Prisma.SubOrderUpdateInput = {};
    if (input.finalStatus) data.status = input.finalStatus;
    else if (pending.fullyRefunded) data.status = "REFUNDED";
    if (pending.fullyRefunded && subOrder.transferStatus === "HELD") data.transferStatus = "REVERSED";
    if (Object.keys(data).length) await tx.subOrder.update({ where: { id: subOrder.id }, data });
    if (input.restock) await restockSubOrders(tx, [subOrder.id]);
    await addEvent(tx, [subOrder.id], (data.status as SubOrderStatus | undefined) ?? subOrder.status, `refund:${split.refundMinor}`, input.actorId);
    await syncOrderStatus(tx, subOrder.orderId);
    const customer = await tx.user.findUniqueOrThrow({ where: { id: subOrder.order.customerId }, select: { id: true, email: true } });
    await queueEmail(tx, customer.email, customer.id, "refund-issued", { orderNumber: subOrder.order.number, amountMinor: split.refundMinor });
  });
  return { refundId: pending.refund.id, ...split };
}

// ───────────────────────── Scheduled jobs ─────────────────────────

/** Cancels unpaid orders whose payment window has passed, releasing their stock. */
export async function expireUnpaidOrders(now = new Date()): Promise<number> {
  const due = await db.order.findMany({ where: { status: "PENDING_PAYMENT", expiresAt: { lt: now } }, select: { id: true }, take: 500 });
  let cancelled = 0;
  for (const { id } of due) {
    if (await db.$transaction((tx) => cancelUnpaidOrder(tx, id, "payment_window_expired"))) cancelled++;
  }
  return cancelled;
}

/** Moves held seller funds into their available balance once the return window has passed. */
export async function releaseDueFunds(now = new Date()): Promise<number> {
  const { count } = await db.subOrder.updateMany({
    // RETURNED: a return closed with a partial refund; the rest is the seller's.
    where: { transferStatus: "HELD", status: { in: ["DELIVERED", "RETURNED"] }, releaseAt: { lte: now } },
    data: { transferStatus: "RELEASED" },
  });
  return count;
}

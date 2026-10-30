import "server-only";
import { db } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import type { OrderStatus, DisputeStatus } from "@/generated/prisma/enums";
import { refundSubOrder, RefundError } from "@/server/payments/service";
import { audit, queueEmail } from "./audit";

export async function listOrdersForAdmin(opts: { status?: OrderStatus; q?: string; page: number; pageSize?: number }) {
  const pageSize = opts.pageSize ?? 25;
  const q = opts.q?.trim();
  const where: Prisma.OrderWhereInput = {
    ...(opts.status ? { status: opts.status } : {}),
    ...(q ? { OR: [{ number: { contains: q.toUpperCase() } }, { customer: { email: { contains: q.toLowerCase() } } }] } : {}),
  };
  const [orders, total] = await Promise.all([
    db.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (opts.page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        number: true,
        status: true,
        totalMinor: true,
        createdAt: true,
        customer: { select: { email: true } },
        _count: { select: { subOrders: true } },
        subOrders: { select: { _count: { select: { disputes: { where: { status: { not: "RESOLVED" } } } } } } },
      },
    }),
    db.order.count({ where }),
  ]);
  return { orders, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getOrderForAdmin(number: string) {
  return db.order.findUnique({
    where: { number },
    include: {
      customer: { select: { id: true, email: true, name: true } },
      paymentEvents: { orderBy: { receivedAt: "asc" }, select: { id: true, type: true, amountMinor: true, receivedAt: true } },
      refunds: { orderBy: { createdAt: "asc" }, include: { initiatedBy: { select: { email: true } } } },
      subOrders: {
        include: {
          shop: { select: { id: true, name: true, slug: true } },
          items: true,
          events: { orderBy: { createdAt: "asc" } },
          returnRequests: { orderBy: { createdAt: "desc" } },
          disputes: { orderBy: { createdAt: "desc" } },
        },
      },
    },
  });
}

export type AdminRefundError = "not_found" | "not_refundable" | "invalid_amount" | "provider_failed";

/** Admin refund on any paid sub-order: full by default, optionally cancelling it and restocking. */
export async function adminRefund(
  adminId: string,
  input: { subOrderId: string; amountMinor?: number; reason: string; restock: boolean; cancel: boolean },
): Promise<{ ok: boolean; error?: AdminRefundError }> {
  const sub = await db.subOrder.findUnique({ where: { id: input.subOrderId }, select: { status: true } });
  if (!sub) return { ok: false, error: "not_found" };
  if (input.cancel && !["PAID", "PROCESSING"].includes(sub.status)) return { ok: false, error: "not_refundable" };
  try {
    const result = await refundSubOrder({
      subOrderId: input.subOrderId,
      amountMinor: input.amountMinor,
      reason: `admin: ${input.reason}`,
      actorId: adminId,
      restock: input.restock,
      finalStatus: input.cancel ? "CANCELLED" : undefined,
    });
    await audit(db, adminId, "order.refund", "SubOrder", input.subOrderId, { amountMinor: result.refundMinor, reason: input.reason, cancel: input.cancel });
    return { ok: true };
  } catch (error) {
    if (error instanceof RefundError) return { ok: false, error: error.code };
    throw error;
  }
}

// ───────────────────────── Disputes ─────────────────────────

export type DisputeMessage = { by: "customer" | "seller" | "admin"; text: string; at: string };

/** A customer reports a problem with one seller's part of a paid order. One open dispute at a time. */
export async function openDispute(userId: string, subOrderId: string, reason: string) {
  const sub = await db.subOrder.findFirst({
    where: { id: subOrderId, order: { customerId: userId, paidAt: { not: null } } },
    select: { id: true, shop: { select: { contactEmail: true, ownerId: true } }, order: { select: { number: true } } },
  });
  if (!sub) return { ok: false as const, error: "not_found" as const };
  const open = await db.dispute.count({ where: { subOrderId, status: { not: "RESOLVED" } } });
  if (open > 0) return { ok: false as const, error: "not_allowed" as const };

  const message: DisputeMessage = { by: "customer", text: reason, at: new Date().toISOString() };
  await db.$transaction(async (tx) => {
    await tx.dispute.create({ data: { subOrderId, openedById: userId, reason, messages: [message] } });
    await queueEmail(tx, sub.shop.contactEmail, sub.shop.ownerId, "dispute-opened", { orderNumber: sub.order.number });
  });
  return { ok: true as const };
}

export async function listDisputes(status?: DisputeStatus) {
  return db.dispute.findMany({
    where: status ? { status } : { status: { not: "RESOLVED" } },
    orderBy: { createdAt: "asc" },
    take: 100,
    include: {
      openedBy: { select: { email: true } },
      subOrder: { select: { id: true, status: true, subtotalMinor: true, shippingMinor: true, shop: { select: { name: true } }, order: { select: { number: true } } } },
    },
  });
}

/** Adds a message (seller or admin). An admin's first reply moves it under review. */
export async function addDisputeMessage(disputeId: string, by: "seller" | "admin", text: string, actorId: string) {
  const dispute = await db.dispute.findUnique({ where: { id: disputeId }, select: { status: true, messages: true, openedById: true } });
  if (!dispute || dispute.status === "RESOLVED") return { ok: false as const };
  const messages = [...(dispute.messages as DisputeMessage[]), { by, text, at: new Date().toISOString() }];
  await db.dispute.update({
    where: { id: disputeId },
    data: { messages, ...(by === "admin" && dispute.status === "OPEN" ? { status: "UNDER_REVIEW" as const } : {}) },
  });
  if (by === "admin") await audit(db, actorId, "dispute.message", "Dispute", disputeId);
  return { ok: true as const };
}

/** Closes a dispute with a written resolution, optionally refunding the customer. */
export async function resolveDispute(
  adminId: string,
  disputeId: string,
  input: { resolution: string; refundMinor?: number; restock: boolean },
): Promise<{ ok: boolean; error?: AdminRefundError | "not_allowed" }> {
  const dispute = await db.dispute.findUnique({
    where: { id: disputeId },
    select: { status: true, subOrderId: true, messages: true, openedBy: { select: { id: true, email: true } } },
  });
  if (!dispute) return { ok: false, error: "not_found" };
  if (dispute.status === "RESOLVED") return { ok: false, error: "not_allowed" };

  if (input.refundMinor) {
    const refund = await adminRefund(adminId, {
      subOrderId: dispute.subOrderId,
      amountMinor: input.refundMinor,
      reason: `dispute: ${input.resolution}`,
      restock: input.restock,
      cancel: false,
    });
    if (!refund.ok) return refund;
  }
  const messages = [...(dispute.messages as DisputeMessage[]), { by: "admin" as const, text: input.resolution, at: new Date().toISOString() }];
  await db.$transaction(async (tx) => {
    await tx.dispute.update({ where: { id: disputeId }, data: { status: "RESOLVED", resolution: input.resolution, messages } });
    await audit(tx, adminId, "dispute.resolve", "Dispute", disputeId, { refundMinor: input.refundMinor ?? 0 });
    await queueEmail(tx, dispute.openedBy.email, dispute.openedBy.id, "dispute-resolved", { resolution: input.resolution });
  });
  return { ok: true };
}

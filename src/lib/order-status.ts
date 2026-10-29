import type { OrderStatus, SubOrderStatus } from "@/generated/prisma/enums";

const CLOSED: SubOrderStatus[] = ["CANCELLED", "REFUNDED"];

/**
 * The customer-facing status of a paid order, from its sub-orders (one per
 * seller). Unpaid orders keep their own status.
 */
export function deriveOrderStatus(current: OrderStatus, subStatuses: SubOrderStatus[], hasRefunds: boolean): OrderStatus {
  if (current === "PENDING_PAYMENT" || (current === "CANCELLED" && !hasRefunds)) return current;
  const active = subStatuses.filter((s) => !CLOSED.includes(s));
  if (active.length === 0) return hasRefunds ? "REFUNDED" : "CANCELLED";
  if (active.every((s) => s === "DELIVERED" || s === "RETURNED")) return "COMPLETED";
  if (active.some((s) => s === "SHIPPED" || s === "DELIVERED")) return "PARTIALLY_FULFILLED";
  if (hasRefunds) return "PARTIALLY_REFUNDED";
  return "PAID";
}

/** Sub-order transitions a seller may make (enforced again in Phase 4's actions). */
export const SELLER_TRANSITIONS: Partial<Record<SubOrderStatus, SubOrderStatus[]>> = {
  PAID: ["PROCESSING"],
  PROCESSING: ["SHIPPED"],
  SHIPPED: ["DELIVERED"],
};

/** Order number like MP-261030-K7Q2XF (no 0/O/1/I to avoid misreading). */
export function generateOrderNumber(now: Date, random: (n: number) => number = (n) => Math.floor(Math.random() * n)): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const date = now.toISOString().slice(2, 10).replace(/-/g, "");
  const suffix = Array.from({ length: 6 }, () => alphabet[random(alphabet.length)]).join("");
  return `MP-${date}-${suffix}`;
}

/** When the return window for a delivered sub-order closes, and whether it's still open. */
export function returnWindow(
  sub: { status: SubOrderStatus; deliveredAt: Date | null },
  returnWindowDays: number,
  now: Date,
): { until: Date | null; canReturn: boolean } {
  if (!sub.deliveredAt) return { until: null, canReturn: false };
  const until = new Date(sub.deliveredAt.getTime() + returnWindowDays * 86_400_000);
  return { until, canReturn: sub.status === "DELIVERED" && until > now };
}

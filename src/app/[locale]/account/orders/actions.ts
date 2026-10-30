"use server";

import { refresh } from "next/cache";
import { hasLocale } from "next-intl";
import { z } from "zod";
import { routing } from "@/i18n/routing";
import { requireUser } from "@/server/auth/guards";
import { cancelPendingOrder, cancelSubOrderByCustomer, requestReturn } from "@/server/orders";
import { openDispute } from "@/server/admin/orders";
import { rateLimit } from "@/server/rate-limit";

export type OrderActionState = { ok?: boolean; error?: "not_found" | "not_allowed" | "refund_failed" | "invalid" };

async function context(formData: FormData) {
  const value = String(formData.get("locale") ?? "");
  const locale = hasLocale(routing.locales, value) ? value : routing.defaultLocale;
  const user = await requireUser(locale);
  return { user, ok: (await rateLimit("account", "orders", user.id)).ok };
}

export async function cancelPendingOrderAction(_prev: OrderActionState, formData: FormData): Promise<OrderActionState> {
  const { user, ok } = await context(formData);
  if (!ok) return { error: "not_allowed" };
  const result = await cancelPendingOrder(user.id, String(formData.get("orderId") ?? ""));
  if (result.ok) refresh();
  return result;
}

export async function cancelSubOrderAction(_prev: OrderActionState, formData: FormData): Promise<OrderActionState> {
  const { user, ok } = await context(formData);
  if (!ok) return { error: "not_allowed" };
  const result = await cancelSubOrderByCustomer(user.id, String(formData.get("subOrderId") ?? ""));
  if (result.ok) refresh();
  return result;
}

export async function openDisputeAction(_prev: OrderActionState, formData: FormData): Promise<OrderActionState> {
  const { user, ok } = await context(formData);
  if (!ok) return { error: "not_allowed" };
  const parsed = returnSchema.safeParse({ subOrderId: formData.get("subOrderId"), reason: formData.get("reason") });
  if (!parsed.success) return { error: "invalid" };
  const result = await openDispute(user.id, parsed.data.subOrderId, parsed.data.reason);
  if (result.ok) refresh();
  return result.ok ? { ok: true } : { error: result.error };
}

const returnSchema = z.object({ subOrderId: z.string().min(1).max(40), reason: z.string().trim().min(5).max(1000) });

export async function requestReturnAction(_prev: OrderActionState, formData: FormData): Promise<OrderActionState> {
  const { user, ok } = await context(formData);
  if (!ok) return { error: "not_allowed" };
  const parsed = returnSchema.safeParse({ subOrderId: formData.get("subOrderId"), reason: formData.get("reason") });
  if (!parsed.success) return { error: "invalid" };
  const result = await requestReturn(user.id, parsed.data.subOrderId, parsed.data.reason);
  if (result.ok) refresh();
  return result;
}

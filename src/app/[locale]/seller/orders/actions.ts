"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { parseMoney } from "@/lib/money";
import { shipmentSchema } from "@/lib/validation/seller";
import { sellerAction } from "@/server/seller/context";
import { advanceSubOrder, cancelBySeller, decideReturn } from "@/server/seller/orders";

export type SellerOrderState = { ok?: boolean; error?: string; fieldErrors?: Record<string, string> };

export async function advanceOrderAction(_prev: SellerOrderState, formData: FormData): Promise<SellerOrderState> {
  const { shop, user, limited } = await sellerAction(formData.get("locale"));
  if (limited) return { error: "rateLimited" };
  const to = String(formData.get("to"));
  const subOrderId = String(formData.get("subOrderId") ?? "");

  if (to === "SHIPPED") {
    const parsed = shipmentSchema.safeParse({ carrier: formData.get("carrier"), trackingNumber: formData.get("trackingNumber") });
    if (!parsed.success) return { fieldErrors: { trackingNumber: "invalidTracking" } };
    const result = await advanceSubOrder(shop.id, subOrderId, "SHIPPED", user.id, parsed.data);
    if (result.ok) refresh();
    return result;
  }
  if (to !== "PROCESSING" && to !== "DELIVERED") return { error: "not_allowed" };
  const result = await advanceSubOrder(shop.id, subOrderId, to, user.id);
  if (result.ok) refresh();
  return result;
}

export async function cancelOrderAction(_prev: SellerOrderState, formData: FormData): Promise<SellerOrderState> {
  const { shop, user, limited } = await sellerAction(formData.get("locale"));
  if (limited) return { error: "rateLimited" };
  const reason = z.string().trim().min(3).max(300).safeParse(formData.get("reason"));
  if (!reason.success) return { fieldErrors: { reason: "reasonRequired" } };
  const result = await cancelBySeller(shop.id, String(formData.get("subOrderId") ?? ""), reason.data, user.id);
  if (result.ok) refresh();
  return result;
}

export async function returnDecisionAction(_prev: SellerOrderState, formData: FormData): Promise<SellerOrderState> {
  const { shop, user, limited } = await sellerAction(formData.get("locale"));
  if (limited) return { error: "rateLimited" };
  const returnId = String(formData.get("returnId") ?? "");
  const action = String(formData.get("decision"));

  let result;
  if (action === "approve") {
    result = await decideReturn(shop.id, returnId, { action: "approve" }, user.id);
  } else if (action === "reject") {
    const note = z.string().trim().min(3).max(500).safeParse(formData.get("note"));
    if (!note.success) return { fieldErrors: { note: "reasonRequired" } };
    result = await decideReturn(shop.id, returnId, { action: "reject", note: note.data }, user.id);
  } else if (action === "refund") {
    const raw = String(formData.get("amount") ?? "").trim();
    const amountMinor = raw ? parseMoney(raw) : undefined;
    if (amountMinor === null) return { fieldErrors: { amount: "invalid_amount" } };
    result = await decideReturn(shop.id, returnId, { action: "refund", amountMinor, restock: formData.get("restock") === "on" }, user.id);
  } else {
    return { error: "not_allowed" };
  }
  if (result.ok) refresh();
  return result;
}

"use server";

import { refresh } from "next/cache";
import { parseLocalDateTime } from "@/lib/dates";
import { parseMoney } from "@/lib/money";
import { discountInputSchema } from "@/lib/validation/seller";
import { sellerAction } from "@/server/seller/context";
import { createDiscount, endDiscount } from "@/server/seller/products";

export type DiscountFormState = { ok?: boolean; error?: string; fieldErrors?: Record<string, string>; values?: Record<string, string> };

export async function createDiscountAction(_prev: DiscountFormState, formData: FormData): Promise<DiscountFormState> {
  const { shop, limited } = await sellerAction(formData.get("locale"));
  if (limited) return { error: "rateLimited" };
  if (shop.status === "SUSPENDED") return { error: "shop_suspended" };

  const values = Object.fromEntries(["productId", "type", "value", "startsAt", "endsAt"].map((f) => [f, String(formData.get(f) ?? "")]));
  const type = formData.get("type") === "FIXED" ? "FIXED" : "PERCENT";
  const rawValue = String(formData.get("value") ?? "");
  // Percent is entered as 15 (→ 1500 bps); a fixed amount in shekels (→ agorot).
  const value = type === "PERCENT" ? Math.round(Number(rawValue) * 100) : (parseMoney(rawValue) ?? 0);
  const parsed = discountInputSchema.safeParse({
    productId: String(formData.get("productId") ?? "") || null,
    type,
    value: Number.isFinite(value) && value > 0 ? value : -1,
    startsAt: parseLocalDateTime(String(formData.get("startsAt") ?? "")),
    endsAt: parseLocalDateTime(String(formData.get("endsAt") ?? "")),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.code === "invalid_type" ? "required" : issue.message;
    return { fieldErrors, values };
  }
  const result = await createDiscount(shop.id, parsed.data);
  if (!result.ok) return { error: "not_found" };
  refresh();
  return { ok: true };
}

export async function endDiscountAction(formData: FormData): Promise<void> {
  const { shop, limited } = await sellerAction(formData.get("locale"));
  if (limited) return;
  await endDiscount(shop.id, String(formData.get("discountId") ?? ""));
  refresh();
}

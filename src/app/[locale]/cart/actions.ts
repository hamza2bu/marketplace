"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { addToCart, setCartItemQuantity, MAX_LINE_QUANTITY, type CartError } from "@/server/cart";
import { rateLimit } from "@/server/rate-limit";

const addSchema = z.object({
  variantId: z.string().min(1).max(40),
  quantity: z.number().int().min(1).max(MAX_LINE_QUANTITY),
});

export async function addToCartAction(
  variantId: string,
  quantity: number,
): Promise<{ ok: true } | { ok: false; error: CartError | "rate_limited" }> {
  const parsed = addSchema.safeParse({ variantId, quantity });
  if (!parsed.success) return { ok: false, error: "invalid_quantity" };
  if (!(await rateLimit("cart", "add")).ok) return { ok: false, error: "rate_limited" };
  const result = await addToCart(parsed.data.variantId, parsed.data.quantity);
  return result.ok ? { ok: true } : result;
}

const updateSchema = z.object({
  itemId: z.string().min(1).max(40),
  quantity: z.coerce.number().int().min(0).max(MAX_LINE_QUANTITY),
});

/** Form action for the quantity selector and the remove button (quantity 0). */
export async function updateCartItemAction(formData: FormData): Promise<void> {
  const parsed = updateSchema.safeParse({ itemId: formData.get("itemId"), quantity: formData.get("quantity") });
  if (!parsed.success) return;
  if (!(await rateLimit("cart", "update")).ok) return;
  await setCartItemQuantity(parsed.data.itemId, parsed.data.quantity);
  refresh();
}

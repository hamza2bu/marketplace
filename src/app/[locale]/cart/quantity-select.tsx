"use client";

import { useTransition } from "react";
import { CART_CHANGED_EVENT } from "@/components/layout/cart-link";
import { updateCartItemAction } from "./actions";

/** Quantity dropdown that saves as soon as it changes. */
export function QuantitySelect({ itemId, quantity, max, label }: { itemId: string; quantity: number; max: number; label: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <select
      aria-label={label}
      defaultValue={quantity}
      disabled={pending}
      onChange={(e) => {
        const form = new FormData();
        form.set("itemId", itemId);
        form.set("quantity", e.target.value);
        startTransition(async () => {
          await updateCartItemAction(form);
          window.dispatchEvent(new Event(CART_CHANGED_EVENT));
        });
      }}
      className="rounded-md border border-border bg-background px-2 py-1 text-sm disabled:opacity-50"
    >
      {Array.from({ length: Math.max(1, max) }, (_, i) => i + 1).map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </select>
  );
}

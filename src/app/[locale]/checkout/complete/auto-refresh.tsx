"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { CART_CHANGED_EVENT } from "@/components/layout/cart-link";

/** Re-checks the order every 2 seconds while the payment confirmation is on its way. */
export function AutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      router.refresh();
      window.dispatchEvent(new Event(CART_CHANGED_EVENT));
    }, 2000);
    return () => clearInterval(id);
  }, [router]);
  return null;
}

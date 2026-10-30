"use client";

import { useTranslations } from "next-intl";
import { CartLink } from "./cart-link";

// Plural labels need a function, which can't be passed from a server component.
export function CartLinkWithLabels() {
  const t = useTranslations("nav");
  return <CartLink label={t("cart")} countLabel={(count) => t("cartCount", { count })} />;
}

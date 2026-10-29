"use client";

import { useTranslations } from "next-intl";

/** Translates a validation/error code, checking seller-specific messages first. */
export function useErrorText() {
  const seller = useTranslations("sellerErrors");
  const errors = useTranslations("errors");
  return (code?: string, values?: Record<string, string | number>) => {
    if (!code) return undefined;
    if (seller.has(code)) return seller(code as "not_found", values as never);
    if (errors.has(code)) return errors(code as "generic");
    return errors("generic");
  };
}

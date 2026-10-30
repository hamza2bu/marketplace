import { defineRouting } from "next-intl/routing";

export const locales = ["he", "ar", "en"] as const;
export type Locale = (typeof locales)[number];

export const routing = defineRouting({
  locales,
  defaultLocale: "he",
  localePrefix: "always",
});

const rtlLocales: readonly Locale[] = ["he", "ar"];

export function directionOf(locale: Locale): "rtl" | "ltr" {
  return rtlLocales.includes(locale) ? "rtl" : "ltr";
}

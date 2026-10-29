import type { Metadata } from "next";
import { routing } from "@/i18n/routing";

/** Canonical URL plus hreflang links for every locale. `path` is locale-less ("/p/x" or ""). */
export function localeAlternates(locale: string, path: string): Metadata["alternates"] {
  const languages: Record<string, string> = Object.fromEntries(routing.locales.map((l) => [l, `/${l}${path}`]));
  languages["x-default"] = `/${routing.defaultLocale}${path}`;
  return { canonical: `/${locale}${path}`, languages };
}

/** Plain-text snippet for meta descriptions. */
export function snippet(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

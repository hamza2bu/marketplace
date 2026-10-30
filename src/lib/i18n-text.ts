/** Picks a translation from a `{ en, he, ar }` JSON column, falling back to Hebrew then English. */
export function localized(value: unknown, locale: string): string {
  if (!value || typeof value !== "object") return "";
  const map = value as Record<string, string | undefined>;
  return map[locale] ?? map.he ?? map.en ?? "";
}

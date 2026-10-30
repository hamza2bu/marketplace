export const CURRENCY = "ILS";

/** Formats agorot as a localized shekel amount, e.g. 12990 → "‏129.90 ₪". */
export function formatMoney(amountMinor: number, locale: string, currency = CURRENCY): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amountMinor / 100);
}

/** Parses a user-entered decimal price ("129.9") to agorot. Returns null if invalid. */
export function parseMoney(input: string): number | null {
  const normalized = input.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

/** Agorot to an editable input value: 12990 → "129.90", null → "". */
export function minorToInput(amountMinor: number | null): string {
  return amountMinor === null ? "" : (amountMinor / 100).toFixed(2);
}

/**
 * Validates an Israeli ID, company (ח.פ) or licensed-dealer (ע.מ) number:
 * 9 digits (shorter ones are zero-padded) with a Luhn-style check digit.
 */
export function isValidIsraeliId(value: string): boolean {
  const digits = value.trim();
  if (!/^\d{5,9}$/.test(digits)) return false;
  const padded = digits.padStart(9, "0");
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let n = Number(padded[i]) * ((i % 2) + 1);
    if (n > 9) n -= 9;
    sum += n;
  }
  return sum % 10 === 0 && Number(padded) !== 0;
}

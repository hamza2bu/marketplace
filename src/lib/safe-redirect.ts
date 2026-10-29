/**
 * Accepts only same-site absolute paths ("/he/account"), so a crafted
 * callbackUrl can't send users to another site after sign-in.
 */
export function safeCallbackPath(value: unknown, fallback: string): string {
  if (typeof value !== "string" || value.length > 512) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  if (/[\u0000-\u001f]/.test(value)) return fallback;
  return value;
}

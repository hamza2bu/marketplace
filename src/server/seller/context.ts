import "server-only";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { requireSeller } from "@/server/auth/guards";
import { rateLimit } from "@/server/rate-limit";

/** For seller server actions: the signed-in seller's shop, re-checked against the database, plus a rate limit. */
export async function sellerAction(localeValue: unknown) {
  const locale = typeof localeValue === "string" && hasLocale(routing.locales, localeValue) ? localeValue : routing.defaultLocale;
  const { user, shop } = await requireSeller(locale);
  if (shop.status === "REMOVED") throw new Error("Shop removed");
  const limited = !(await rateLimit("account", "seller", user.id)).ok;
  return { locale, user, shop, limited };
}

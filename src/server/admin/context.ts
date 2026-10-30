import "server-only";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { requireAdmin } from "@/server/auth/guards";
import { rateLimit } from "@/server/rate-limit";

/** For admin server actions: re-checks the admin against the database, plus a rate limit. */
export async function adminAction(localeValue: unknown) {
  const locale = typeof localeValue === "string" && hasLocale(routing.locales, localeValue) ? localeValue : routing.defaultLocale;
  const admin = await requireAdmin(locale);
  const limited = !(await rateLimit("account", "admin", admin.id)).ok;
  return { locale, admin, limited };
}

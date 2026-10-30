import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { consumeToken } from "@/server/auth/tokens";
import { db } from "@/server/db";

export const metadata: Metadata = { robots: { index: false }, referrer: "no-referrer" };

// Opening the link confirms the address. (Harmless if a mail scanner opens it
// first: confirming an address someone received is the point.)
export default async function VerifyEmailPage({ params, searchParams }: PageProps<"/[locale]/verify-email">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const email = typeof sp.email === "string" ? sp.email.toLowerCase() : "";
  const token = typeof sp.token === "string" ? sp.token : "";
  const ok = email && token ? await consumeToken("verify", email, token) : false;
  if (ok) await db.user.updateMany({ where: { email, emailVerified: null }, data: { emailVerified: new Date() } });
  const [t, nav] = await Promise.all([getTranslations("auth"), getTranslations("nav")]);

  return (
    <div className="mx-auto max-w-sm space-y-4 py-8 text-center">
      <p role="status" className={ok ? "text-lg font-medium" : "text-danger"}>
        {ok ? t("verified") : t("verifyInvalid")}
      </p>
      <Link href="/account" className="inline-block rounded-md bg-brand px-4 py-2 font-medium text-brand-foreground">
        {nav("account")}
      </Link>
    </div>
  );
}

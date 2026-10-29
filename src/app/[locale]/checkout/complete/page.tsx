import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/server/auth/guards";
import { db } from "@/server/db";
import { AutoRefresh } from "./auto-refresh";

export const metadata: Metadata = { robots: { index: false } };

// Where the payment provider sends the customer back. The webhook, not this
// page, decides whether the order is paid; this page only shows the result.
export default async function CheckoutCompletePage({ params, searchParams }: PageProps<"/[locale]/checkout/complete">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale);
  const { order: number } = await searchParams;
  if (typeof number !== "string") notFound();
  const order = await db.order.findFirst({ where: { number, customerId: user.id }, select: { number: true, status: true } });
  if (!order) notFound();
  const t = await getTranslations("checkout");

  if (order.status === "PENDING_PAYMENT") {
    return (
      <div className="mx-auto max-w-md space-y-3 py-12 text-center">
        <AutoRefresh />
        <h1 className="text-2xl font-bold">{t("pendingTitle")}</h1>
        <p className="text-muted">{t("pendingBody")}</p>
      </div>
    );
  }

  if (order.status === "CANCELLED") {
    return (
      <div className="mx-auto max-w-md space-y-4 py-12 text-center">
        <h1 className="text-2xl font-bold">{t("failedTitle")}</h1>
        <p className="text-muted">{t("failedBody", { number: order.number })}</p>
        <Link href="/cart" className="inline-block rounded-md bg-brand px-4 py-2 font-medium text-brand-foreground">
          {t("backToCart")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-4 py-12 text-center">
      <p aria-hidden className="text-5xl">✓</p>
      <h1 className="text-2xl font-bold">{t("completeTitle")}</h1>
      <p className="text-muted">{t("completeBody", { number: order.number, email: user.email })}</p>
      <Link href={`/account/orders/${order.number}`} className="inline-block rounded-md bg-brand px-4 py-2 font-medium text-brand-foreground">
        {t("viewOrder")}
      </Link>
    </div>
  );
}

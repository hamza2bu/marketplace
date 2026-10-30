import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { formatMoney } from "@/lib/money";
import { requireUser } from "@/server/auth/guards";
import { db } from "@/server/db";
import { isTestProviderEnabled } from "@/server/payments";
import { TEST_PROVIDER_ID } from "@/server/payments/providers/test-provider";
import { completeTestPayment } from "./actions";

export const metadata: Metadata = { robots: { index: false } };

// Stand-in for a payment provider's hosted page. Only exists while the
// test provider is enabled, and only for the order's own customer.
export default async function TestPaymentPage({ params }: PageProps<"/[locale]/pay/test/[ref]">) {
  const { locale, ref } = await params;
  setRequestLocale(locale);
  if (!isTestProviderEnabled()) notFound();
  const user = await requireUser(locale);
  const order = await db.order.findFirst({
    where: { paymentRef: ref, paymentProvider: TEST_PROVIDER_ID, customerId: user.id },
    select: { number: true, totalMinor: true, status: true },
  });
  if (!order) notFound();
  const t = await getTranslations("pay");

  return (
    <div className="mx-auto max-w-md space-y-6">
      <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{t("banner")}</p>
      <div className="space-y-4 rounded-lg border border-border p-6">
        <h1 className="text-xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted" dir="ltr">
          {t("order", { number: order.number })}
        </p>
        <div>
          <p className="text-sm text-muted">{t("amount")}</p>
          <p className="text-3xl font-bold">{formatMoney(order.totalMinor, locale)}</p>
        </div>
        {order.status === "PENDING_PAYMENT" ? (
          <form action={completeTestPayment} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="ref" value={ref} />
            <button name="outcome" value="approve" className="rounded-md bg-brand px-4 py-3 font-semibold text-brand-foreground">
              {t("approve")}
            </button>
            <button name="outcome" value="decline" className="rounded-md border border-danger px-4 py-3 font-semibold text-danger">
              {t("decline")}
            </button>
          </form>
        ) : (
          <p className="text-sm text-muted">{t("notPending")}</p>
        )}
      </div>
    </div>
  );
}

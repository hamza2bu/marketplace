"use server";

import { redirect } from "next/navigation";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { requireUser } from "@/server/auth/guards";
import { db } from "@/server/db";
import { isTestProviderEnabled } from "@/server/payments";
import { buildTestWebhook, TEST_PROVIDER_ID } from "@/server/payments/providers/test-provider";
import { handlePaymentWebhook } from "@/server/payments/service";

/**
 * The test provider's "customer pressed a button" step. It sends the same
 * signed webhook a real provider would, through the same handler.
 */
export async function completeTestPayment(formData: FormData) {
  const localeValue = String(formData.get("locale") ?? "");
  const locale = hasLocale(routing.locales, localeValue) ? localeValue : routing.defaultLocale;
  if (!isTestProviderEnabled()) redirect(`/${locale}`);
  const user = await requireUser(locale);

  const order = await db.order.findFirst({
    where: { paymentRef: String(formData.get("ref") ?? ""), paymentProvider: TEST_PROVIDER_ID, customerId: user.id },
    select: { id: true, number: true, totalMinor: true, currency: true, paymentRef: true, status: true },
  });
  if (!order) redirect(`/${locale}`);

  if (order.status === "PENDING_PAYMENT") {
    const outcome = formData.get("outcome") === "approve" ? "payment.succeeded" : "payment.failed";
    const { body, headers } = buildTestWebhook({
      type: outcome,
      paymentRef: order.paymentRef!,
      orderId: order.id,
      amountMinor: order.totalMinor,
      currency: order.currency,
    });
    await handlePaymentWebhook(TEST_PROVIDER_ID, body, headers);
  }
  redirect(`/${locale}/checkout/complete?order=${order.number}`);
}

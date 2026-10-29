import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { routing } from "@/i18n/routing";
import { WebhookVerificationError, type PaymentProvider, type PaymentWebhookEvent } from "../types";

// A stand-in provider for development and demos: its "hosted payment page"
// lives in this app (/[locale]/pay/test/[ref]) and has Approve / Decline
// buttons. No card details are ever asked for. Its webhooks are HMAC-signed
// and go through the same verification and processing as a real provider's.

export const TEST_PROVIDER_ID = "test";
const SIGNATURE_HEADER = "x-test-signature";

function secret(): string {
  const value = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!value || value.length < 16) throw new Error("PAYMENT_WEBHOOK_SECRET must be set (16+ characters)");
  return value;
}

function sign(body: string): string {
  return createHmac("sha256", secret()).update(body).digest("hex");
}

/** Builds a signed webhook exactly as the provider would send it. */
export function buildTestWebhook(event: Omit<PaymentWebhookEvent, "eventId" | "raw">) {
  const body = JSON.stringify({ id: `evt_${randomBytes(12).toString("hex")}`, ...event });
  return { body, headers: new Headers({ "content-type": "application/json", [SIGNATURE_HEADER]: sign(body) }) };
}

export const testProvider: PaymentProvider = {
  id: TEST_PROVIDER_ID,

  async createPayment(input) {
    const paymentRef = `test_${randomBytes(12).toString("hex")}`;
    const locale = routing.locales.includes(input.locale as never) ? input.locale : routing.defaultLocale;
    return { paymentRef, redirectUrl: `/${locale}/pay/test/${paymentRef}` };
  },

  async parseWebhook(rawBody, headers) {
    const given = Buffer.from(headers.get(SIGNATURE_HEADER) ?? "", "hex");
    const expected = Buffer.from(sign(rawBody), "hex");
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new WebhookVerificationError("Bad signature");
    }
    const data = JSON.parse(rawBody) as Record<string, unknown>;
    const type = data.type;
    if (
      typeof data.id !== "string" ||
      (type !== "payment.succeeded" && type !== "payment.failed") ||
      typeof data.paymentRef !== "string" ||
      typeof data.orderId !== "string" ||
      !Number.isInteger(data.amountMinor) ||
      typeof data.currency !== "string"
    ) {
      throw new WebhookVerificationError("Malformed event");
    }
    return {
      eventId: data.id,
      type,
      paymentRef: data.paymentRef,
      orderId: data.orderId,
      amountMinor: data.amountMinor as number,
      currency: data.currency,
      raw: data,
    };
  },

  async refund() {
    return { refundRef: `test_refund_${randomBytes(12).toString("hex")}` };
  },
};

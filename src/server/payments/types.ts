// The contract every payment provider adapter implements. The platform
// collects the customer's payment; sellers are paid out from the ledger.

export type CreatePaymentInput = {
  orderId: string;
  orderNumber: string;
  amountMinor: number;
  currency: string;
  description: string;
  customer: { name: string | null; email: string };
  locale: string;
  successUrl: string; // absolute
  cancelUrl: string; // absolute
  webhookUrl: string; // absolute
};

export type PaymentWebhookEvent = {
  eventId: string; // unique per provider; used to ignore retries
  type: "payment.succeeded" | "payment.failed";
  paymentRef: string;
  orderId: string;
  amountMinor: number;
  currency: string;
  raw: unknown;
};

export interface PaymentProvider {
  readonly id: string;
  /** Starts a payment and returns where to send the customer (the provider's hosted page). */
  createPayment(input: CreatePaymentInput): Promise<{ paymentRef: string; redirectUrl: string }>;
  /** Verifies the webhook signature and parses it. Throws on anything not authentic. */
  parseWebhook(rawBody: string, headers: Headers): Promise<PaymentWebhookEvent>;
  /** Refunds part or all of a captured payment. */
  refund(input: { paymentRef: string; amountMinor: number; reason: string }): Promise<{ refundRef: string }>;
}

export class WebhookVerificationError extends Error {}

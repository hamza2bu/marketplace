import "server-only";
import { testProvider, TEST_PROVIDER_ID } from "./providers/test-provider";
import type { PaymentProvider } from "./types";

// Register real providers here, e.g. `[payplusProvider.id]: payplusProvider`.
const providers: Record<string, PaymentProvider> = {
  [TEST_PROVIDER_ID]: testProvider,
};

/** The provider new payments go through, from PAYMENT_PROVIDER (default: test). */
export function activeProvider(): PaymentProvider {
  const id = process.env.PAYMENT_PROVIDER || TEST_PROVIDER_ID;
  if (id === TEST_PROVIDER_ID && process.env.NODE_ENV === "production" && process.env.ALLOW_TEST_PAYMENTS !== "true") {
    throw new Error("The test payment provider is disabled in production. Set PAYMENT_PROVIDER.");
  }
  const provider = providers[id];
  if (!provider) throw new Error(`Unknown payment provider: ${id}`);
  return provider;
}

/** A provider by id, for webhooks and refunds on existing payments. */
export function providerById(id: string): PaymentProvider | null {
  if (id === TEST_PROVIDER_ID && !isTestProviderEnabled()) return null;
  return providers[id] ?? null;
}

export function isTestProviderEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.ALLOW_TEST_PAYMENTS === "true";
}

export type { PaymentProvider } from "./types";

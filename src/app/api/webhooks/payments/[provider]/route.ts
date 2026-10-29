import { WebhookVerificationError } from "@/server/payments/types";
import { handlePaymentWebhook, UnknownProviderError } from "@/server/payments/service";

// Payment providers call this when a payment succeeds or fails. The body is
// verified by the provider adapter (signature check) before anything happens.
export async function POST(request: Request, ctx: RouteContext<"/api/webhooks/payments/[provider]">) {
  const { provider } = await ctx.params;
  const body = await request.text();
  if (body.length > 64 * 1024) return Response.json({ error: "too_large" }, { status: 413 });

  try {
    const outcome = await handlePaymentWebhook(provider, body, request.headers);
    return Response.json({ received: true, outcome });
  } catch (error) {
    if (error instanceof UnknownProviderError) return Response.json({ error: "unknown_provider" }, { status: 404 });
    if (error instanceof WebhookVerificationError || error instanceof SyntaxError) {
      return Response.json({ error: "invalid" }, { status: 400 });
    }
    // Anything else: let the provider retry later.
    console.error("[PaymentWebhook] failed", error);
    return Response.json({ error: "retry" }, { status: 500 });
  }
}

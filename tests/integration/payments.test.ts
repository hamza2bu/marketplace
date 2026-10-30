import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { buildTestWebhook, testProvider, TEST_PROVIDER_ID } from "@/server/payments/providers/test-provider";
import { expireUnpaidOrders, handlePaymentWebhook, refundSubOrder, releaseDueFunds } from "@/server/payments/service";
import { WebhookVerificationError } from "@/server/payments/types";
import { splitOrder } from "@/lib/pricing";

// Exercises the payment lifecycle against the real database, using seeded
// products. Everything created here is tagged and removed afterwards.
const TAG = `it-${Date.now()}`;
const settings = { globalCommissionBps: 1000, vatBps: 1800, shippingFlatMinor: 2990, freeShippingOverMinor: 19900 };
let customerId: string;
const createdOrderIds: string[] = [];

async function variantWithStock(slug: string) {
  return db.productVariant.findFirstOrThrow({
    where: { product: { slug }, stock: { gte: 3 } },
    include: { product: { select: { id: true, title: true, shopId: true } } },
  });
}

/** An unpaid order for one unit each of the given products, with stock reserved, as checkout would create it. */
async function createPendingOrder(slugs: string[], expiresAt = new Date(Date.now() + 30 * 60_000)) {
  const variants = await Promise.all(slugs.map(variantWithStock));
  const split = splitOrder(
    variants.map((v) => ({ shopId: v.product.shopId, unitPriceMinor: v.priceMinor, quantity: 1, commissionBps: 1000 })),
    settings,
  );
  for (const v of variants) await db.productVariant.update({ where: { id: v.id }, data: { stock: { decrement: 1 } } });
  const { paymentRef } = await testProvider.createPayment({
    orderId: "x", orderNumber: "x", amountMinor: split.totalMinor, currency: "ILS", description: "", customer: { name: null, email: "" },
    locale: "en", successUrl: "", cancelUrl: "", webhookUrl: "",
  });
  const order = await db.order.create({
    data: {
      number: `${TAG}-${createdOrderIds.length}`,
      customerId,
      subtotalMinor: split.subtotalMinor,
      shippingMinor: split.shippingMinor,
      vatMinor: split.vatMinor,
      totalMinor: split.totalMinor,
      shippingAddress: {},
      paymentProvider: TEST_PROVIDER_ID,
      paymentRef,
      expiresAt,
      subOrders: {
        create: split.shops.map((s) => ({
          shopId: s.shopId,
          subtotalMinor: s.subtotalMinor,
          shippingMinor: s.shippingMinor,
          commissionMinor: s.commissionMinor,
          sellerNetMinor: s.sellerNetMinor,
          items: {
            create: variants
              .filter((v) => v.product.shopId === s.shopId)
              .map((v) => ({
                variantId: v.id, productId: v.product.id, titleSnapshot: v.product.title, skuSnapshot: v.sku,
                unitPriceMinor: v.priceMinor, quantity: 1, commissionBps: 1000, lineTotalMinor: v.priceMinor,
              })),
          },
        })),
      },
    },
    include: { subOrders: true },
  });
  createdOrderIds.push(order.id);
  return { order, variants };
}

function webhookFor(order: { id: string; paymentRef: string | null; totalMinor: number }, type: "payment.succeeded" | "payment.failed", amountMinor = order.totalMinor) {
  return buildTestWebhook({ type, paymentRef: order.paymentRef!, orderId: order.id, amountMinor, currency: "ILS" });
}

const stockOf = async (id: string) => (await db.productVariant.findUniqueOrThrow({ where: { id } })).stock;
const ledgerSum = async (subOrderId: string) =>
  (await db.ledgerEntry.aggregate({ where: { subOrderId }, _sum: { amountMinor: true } }))._sum.amountMinor ?? 0;

beforeAll(async () => {
  const customer = await db.user.create({ data: { email: `${TAG}@example.com`, name: "Integration Test" } });
  customerId = customer.id;
});

afterAll(async () => {
  const subOrders = await db.subOrder.findMany({ where: { orderId: { in: createdOrderIds } }, include: { items: true } });
  // Put back whatever stock these orders still hold, then remove them.
  for (const s of subOrders) {
    // REFUNDED here means refunded without restocking (the damaged-item case).
    if (["PAID", "PROCESSING", "SHIPPED", "DELIVERED", "RETURN_REQUESTED", "REFUNDED"].includes(s.status)) {
      for (const i of s.items) await db.productVariant.update({ where: { id: i.variantId! }, data: { stock: { increment: i.quantity } } });
    }
  }
  const pending = await db.order.findMany({ where: { id: { in: createdOrderIds }, status: "PENDING_PAYMENT" }, include: { subOrders: { include: { items: true } } } });
  for (const o of pending) for (const i of o.subOrders.flatMap((s) => s.items)) {
    await db.productVariant.update({ where: { id: i.variantId! }, data: { stock: { increment: i.quantity } } });
  }
  await db.ledgerEntry.deleteMany({ where: { subOrderId: { in: subOrders.map((s) => s.id) } } });
  await db.refund.deleteMany({ where: { orderId: { in: createdOrderIds } } });
  await db.paymentEvent.deleteMany({ where: { orderId: { in: createdOrderIds } } });
  await db.emailLog.deleteMany({ where: { OR: [{ userId: customerId }, { payload: { path: ["orderNumber"], string_starts_with: TAG } }] } });
  await db.auditLog.deleteMany({ where: { entityId: { in: createdOrderIds } } });
  await db.order.deleteMany({ where: { id: { in: createdOrderIds } } });
  await db.user.delete({ where: { id: customerId } });
  await db.$disconnect();
});

describe("payment webhooks", () => {
  it("marks the order paid once, books the ledger, and ignores the retry", async () => {
    const { order } = await createPendingOrder(["braided-usb-c-cable-2m", "silk-scarf"]);
    const { body, headers } = webhookFor(order, "payment.succeeded");

    expect(await handlePaymentWebhook(TEST_PROVIDER_ID, body, headers)).toBe("paid");
    expect(await handlePaymentWebhook(TEST_PROVIDER_ID, body, headers)).toBe("duplicate");

    const paid = await db.order.findUniqueOrThrow({ where: { id: order.id }, include: { subOrders: true } });
    expect(paid.status).toBe("PAID");
    expect(paid.subOrders.every((s) => s.status === "PAID" && s.transferStatus === "HELD")).toBe(true);
    for (const s of paid.subOrders) expect(await ledgerSum(s.id)).toBe(s.sellerNetMinor);
    const entries = await db.ledgerEntry.count({ where: { subOrderId: { in: paid.subOrders.map((s) => s.id) } } });
    expect(entries).toBe(4); // SALE + COMMISSION per shop, once
  });

  it("rejects a forged signature", async () => {
    const { order } = await createPendingOrder(["baseball-cap"]);
    const { body } = webhookFor(order, "payment.succeeded");
    const forged = new Headers({ "x-test-signature": "00".repeat(32) });
    await expect(handlePaymentWebhook(TEST_PROVIDER_ID, body, forged)).rejects.toBeInstanceOf(WebhookVerificationError);
    await expect(handlePaymentWebhook(TEST_PROVIDER_ID, body.replace(`"amountMinor":${order.totalMinor}`, '"amountMinor":1'), webhookFor(order, "payment.succeeded").headers)).rejects.toBeInstanceOf(WebhookVerificationError);
  });

  it("never marks an order paid for the wrong amount", async () => {
    const { order } = await createPendingOrder(["baseball-cap"]);
    const { body, headers } = webhookFor(order, "payment.succeeded", order.totalMinor - 100);
    expect(await handlePaymentWebhook(TEST_PROVIDER_ID, body, headers)).toBe("ignored");
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PENDING_PAYMENT");
    expect(await db.auditLog.count({ where: { entityId: order.id, action: "payment.amount_mismatch" } })).toBe(1);
  });

  it("cancels the order and returns stock when payment fails", async () => {
    const { order, variants } = await createPendingOrder(["bamboo-cutting-board"]);
    const before = await stockOf(variants[0].id);
    const { body, headers } = webhookFor(order, "payment.failed");
    expect(await handlePaymentWebhook(TEST_PROVIDER_ID, body, headers)).toBe("failed");
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("CANCELLED");
    expect(await stockOf(variants[0].id)).toBe(before + 1);
  });
});

describe("expiry", () => {
  it("cancels unpaid orders after the payment window and restocks", async () => {
    const { order, variants } = await createPendingOrder(["bamboo-cutting-board"], new Date(Date.now() - 1000));
    const before = await stockOf(variants[0].id);
    expect(await expireUnpaidOrders()).toBeGreaterThanOrEqual(1);
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("CANCELLED");
    expect(await stockOf(variants[0].id)).toBe(before + 1);
  });

  it("still honours a payment that arrives after expiry while stock remains", async () => {
    const { order } = await createPendingOrder(["bamboo-cutting-board"], new Date(Date.now() - 1000));
    await expireUnpaidOrders();
    const { body, headers } = webhookFor(order, "payment.succeeded");
    expect(await handlePaymentWebhook(TEST_PROVIDER_ID, body, headers)).toBe("paid");
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PAID");
  });
});

describe("refunds", () => {
  it("partial then full refund leaves the seller's ledger at zero", async () => {
    const { order } = await createPendingOrder(["silk-scarf"]);
    const { body, headers } = webhookFor(order, "payment.succeeded");
    await handlePaymentWebhook(TEST_PROVIDER_ID, body, headers);
    const sub = order.subOrders[0];

    await refundSubOrder({ subOrderId: sub.id, amountMinor: 1000, reason: "damaged", actorId: customerId });
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PARTIALLY_REFUNDED");

    await refundSubOrder({ subOrderId: sub.id, reason: "returned", actorId: customerId });
    const after = await db.subOrder.findUniqueOrThrow({ where: { id: sub.id } });
    expect(after.status).toBe("REFUNDED");
    expect(after.transferStatus).toBe("REVERSED");
    expect(await ledgerSum(sub.id)).toBe(0);
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("REFUNDED");

    await expect(refundSubOrder({ subOrderId: sub.id, amountMinor: 1, reason: "again", actorId: customerId })).rejects.toThrow();
  });

  it("cancelling before shipping refunds in full and restocks", async () => {
    const { order, variants } = await createPendingOrder(["baseball-cap"]);
    const { body, headers } = webhookFor(order, "payment.succeeded");
    await handlePaymentWebhook(TEST_PROVIDER_ID, body, headers);
    const before = await stockOf(variants[0].id);

    await refundSubOrder({ subOrderId: order.subOrders[0].id, reason: "cancelled_by_customer", actorId: customerId, restock: true, finalStatus: "CANCELLED" });
    expect((await db.subOrder.findUniqueOrThrow({ where: { id: order.subOrders[0].id } })).status).toBe("CANCELLED");
    expect(await stockOf(variants[0].id)).toBe(before + 1);
  });
});

describe("releasing seller funds", () => {
  it("releases held funds only after delivery plus the return window", async () => {
    const { order } = await createPendingOrder(["baseball-cap"]);
    const { body, headers } = webhookFor(order, "payment.succeeded");
    await handlePaymentWebhook(TEST_PROVIDER_ID, body, headers);
    const sub = order.subOrders[0];

    await db.subOrder.update({ where: { id: sub.id }, data: { status: "DELIVERED", deliveredAt: new Date(), releaseAt: new Date(Date.now() + 86_400_000) } });
    await releaseDueFunds();
    expect((await db.subOrder.findUniqueOrThrow({ where: { id: sub.id } })).transferStatus).toBe("HELD");

    await db.subOrder.update({ where: { id: sub.id }, data: { releaseAt: new Date(Date.now() - 1000) } });
    await releaseDueFunds();
    expect((await db.subOrder.findUniqueOrThrow({ where: { id: sub.id } })).transferStatus).toBe("RELEASED");
  });
});

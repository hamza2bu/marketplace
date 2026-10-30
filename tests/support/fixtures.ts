import { expect } from "vitest";
import { db } from "@/server/db";
import { buildTestWebhook, testProvider, TEST_PROVIDER_ID } from "@/server/payments/providers/test-provider";
import { handlePaymentWebhook } from "@/server/payments/service";
import { encryptJson } from "@/server/crypto";
import { splitOrder } from "@/lib/pricing";

/** Records created by a test file, for cleanup. */
export function fixtureScope(tag: string) {
  const orderIds: string[] = [];
  const shopIds: string[] = [];
  const userIds: string[] = [];

  async function user(suffix: string, role: "CUSTOMER" | "SELLER" | "ADMIN" = "CUSTOMER") {
    const u = await db.user.create({ data: { email: `${tag}-${suffix}@example.com`, role } });
    userIds.push(u.id);
    return u;
  }

  async function shop(suffix: string, status: "PENDING" | "APPROVED" = "APPROVED") {
    const owner = await user(`${suffix}-owner`, "SELLER");
    const s = await db.shop.create({
      data: {
        ownerId: owner.id, name: `Shop ${tag} ${suffix}`, slug: `shop-${tag}-${suffix}`, status, legalName: "Test Ltd", taxId: "515000008",
        businessAddress: {}, contactEmail: owner.email, contactPhone: "0500000000",
        payoutBankEncrypted: encryptJson({ holderName: "Test Ltd", bankCode: "12", branch: "600", account: "1234567" }), payoutBankLast4: "4567",
      },
    });
    shopIds.push(s.id);
    return { ...s, owner };
  }

  async function product(shopId: string, suffix: string, priceMinor = 10000) {
    const category = await db.category.findUniqueOrThrow({ where: { slug: "kitchen" } });
    return db.product.create({
      data: {
        shopId, categoryId: category.id, title: `Product ${tag} ${suffix}`, slug: `p-${tag}-${suffix}`, description: "Test product", status: "ACTIVE", minPriceMinor: priceMinor,
        variants: { create: { sku: `${tag}-${suffix}`.toUpperCase(), priceMinor, stock: 50, isDefault: true } },
      },
      include: { variants: true },
    });
  }

  /** A paid order for one unit of the variant, paid through the test provider's webhook. */
  async function paidOrder(customerId: string, variantId: string) {
    const variant = await db.productVariant.findUniqueOrThrow({ where: { id: variantId }, include: { product: true } });
    const split = splitOrder([{ shopId: variant.product.shopId, unitPriceMinor: variant.priceMinor, quantity: 1, commissionBps: 1000 }], {
      globalCommissionBps: 1000, vatBps: 1800, shippingFlatMinor: 2990, freeShippingOverMinor: 19900,
    });
    await db.productVariant.update({ where: { id: variantId }, data: { stock: { decrement: 1 } } });
    const { paymentRef } = await testProvider.createPayment({
      orderId: "", orderNumber: "", amountMinor: 0, currency: "ILS", description: "", customer: { name: null, email: "" }, locale: "en", successUrl: "", cancelUrl: "", webhookUrl: "",
    });
    const s = split.shops[0];
    const order = await db.order.create({
      data: {
        number: `${tag}-${orderIds.length}`, customerId, subtotalMinor: split.subtotalMinor, shippingMinor: split.shippingMinor, vatMinor: split.vatMinor,
        totalMinor: split.totalMinor, shippingAddress: {}, paymentProvider: TEST_PROVIDER_ID, paymentRef,
        subOrders: {
          create: {
            shopId: s.shopId, subtotalMinor: s.subtotalMinor, shippingMinor: s.shippingMinor, commissionMinor: s.commissionMinor, sellerNetMinor: s.sellerNetMinor,
            items: { create: { variantId, productId: variant.productId, titleSnapshot: variant.product.title, skuSnapshot: variant.sku, unitPriceMinor: variant.priceMinor, quantity: 1, commissionBps: 1000, lineTotalMinor: variant.priceMinor } },
          },
        },
      },
      include: { subOrders: true },
    });
    orderIds.push(order.id);
    const { body, headers } = buildTestWebhook({ type: "payment.succeeded", paymentRef, orderId: order.id, amountMinor: order.totalMinor, currency: "ILS" });
    expect(await handlePaymentWebhook(TEST_PROVIDER_ID, body, headers)).toBe("paid");
    return { order, sub: order.subOrders[0] };
  }

  async function cleanup() {
    const subIds = (await db.subOrder.findMany({ where: { orderId: { in: orderIds } }, select: { id: true } })).map((s) => s.id);
    await db.dispute.deleteMany({ where: { subOrderId: { in: subIds } } });
    await db.returnRequest.deleteMany({ where: { subOrderId: { in: subIds } } });
    await db.ledgerEntry.deleteMany({ where: { OR: [{ shopId: { in: shopIds } }, { subOrderId: { in: subIds } }] } });
    await db.payout.deleteMany({ where: { shopId: { in: shopIds } } });
    await db.refund.deleteMany({ where: { orderId: { in: orderIds } } });
    await db.paymentEvent.deleteMany({ where: { orderId: { in: orderIds } } });
    await db.order.deleteMany({ where: { id: { in: orderIds } } });
    await db.review.deleteMany({ where: { userId: { in: userIds } } });
    await db.product.deleteMany({ where: { shopId: { in: shopIds } } });
    await db.shop.deleteMany({ where: { id: { in: shopIds } } });
    await db.emailLog.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { to: { contains: tag } }] } });
    await db.auditLog.deleteMany({ where: { OR: [{ actorId: { in: userIds } }, { entityId: { in: [...shopIds, ...orderIds, ...subIds, ...userIds] } }] } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
  }

  return { user, shop, product, paidOrder, cleanup };
}

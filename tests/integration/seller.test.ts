import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Product saves revalidate cached pages; there's no Next.js cache in tests.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), refresh: vi.fn(), revalidateTag: vi.fn() }));
// Not used by these flows; stubbed because they load Auth.js, which needs the Next.js runtime.
vi.mock("@/server/auth/guards", () => ({}));
vi.mock("@/server/cart", () => ({}));

import { db } from "@/server/db";
import { buildTestWebhook, testProvider, TEST_PROVIDER_ID } from "@/server/payments/providers/test-provider";
import { handlePaymentWebhook, releaseDueFunds } from "@/server/payments/service";
import { requestReturn } from "@/server/orders";
import { changeProductLifecycle, createDiscount, endDiscount, saveProduct } from "@/server/seller/products";
import { advanceSubOrder, cancelBySeller, decideReturn } from "@/server/seller/orders";
import { balances } from "@/server/seller/analytics";
import { productInputSchema, type ProductInput } from "@/lib/validation/seller";
import { splitOrder } from "@/lib/pricing";

const TAG = `st${Date.now()}`;
let shop: { id: string; status: string; ownerId: string };
let customerId: string;
let leafCategoryId: string;
const orderIds: string[] = [];
const productIds: string[] = [];

function productInput(over: Partial<ProductInput> = {}): ProductInput {
  return productInputSchema.parse({
    title: `Test lamp ${TAG}`,
    slug: `test-lamp-${TAG}`,
    categoryId: leafCategoryId,
    brandName: "Lumo",
    description: "A test lamp used by the integration tests.",
    specs: [{ key: "Power", value: "8W" }],
    images: [{ url: "/placeholder/test-lamp-1.svg" }],
    variants: [
      { attributes: { color: "white" }, sku: `${TAG}-W`, priceMinor: 10000, compareAtMinor: null, stock: 10, isActive: true },
      { attributes: { color: "black" }, sku: `${TAG}-B`, priceMinor: 12000, compareAtMinor: null, stock: 10, isActive: true },
    ],
    intent: "publish",
    ...over,
  });
}

/** A paid order for one unit of the given variant. */
async function paidOrderFor(variantId: string) {
  const variant = await db.productVariant.findUniqueOrThrow({ where: { id: variantId }, include: { product: true } });
  const split = splitOrder([{ shopId: variant.product.shopId, unitPriceMinor: variant.priceMinor, quantity: 1, commissionBps: 1200 }], {
    globalCommissionBps: 1000,
    vatBps: 1800,
    shippingFlatMinor: 2990,
    freeShippingOverMinor: 19900,
  });
  await db.productVariant.update({ where: { id: variant.id }, data: { stock: { decrement: 1 } } });
  const { paymentRef } = await testProvider.createPayment({
    orderId: "", orderNumber: "", amountMinor: 0, currency: "ILS", description: "", customer: { name: null, email: "" }, locale: "en", successUrl: "", cancelUrl: "", webhookUrl: "",
  });
  const s = split.shops[0];
  const order = await db.order.create({
    data: {
      number: `${TAG}-${orderIds.length}`, customerId, subtotalMinor: split.subtotalMinor, shippingMinor: split.shippingMinor, vatMinor: split.vatMinor,
      totalMinor: split.totalMinor, shippingAddress: { fullName: "T", phone: "0500000000", line1: "x", city: "y", postalCode: "1234567" },
      paymentProvider: TEST_PROVIDER_ID, paymentRef,
      subOrders: {
        create: {
          shopId: s.shopId, subtotalMinor: s.subtotalMinor, shippingMinor: s.shippingMinor, commissionMinor: s.commissionMinor, sellerNetMinor: s.sellerNetMinor,
          items: { create: { variantId: variant.id, productId: variant.productId, titleSnapshot: variant.product.title, skuSnapshot: variant.sku, unitPriceMinor: variant.priceMinor, quantity: 1, commissionBps: 1200, lineTotalMinor: variant.priceMinor } },
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

const subStatus = async (id: string) => (await db.subOrder.findUniqueOrThrow({ where: { id } })).status;

beforeAll(async () => {
  const owner = await db.user.create({ data: { email: `${TAG}-seller@example.com`, role: "SELLER" } });
  const created = await db.shop.create({
    data: {
      ownerId: owner.id, name: `Shop ${TAG}`, slug: `shop-${TAG}`, status: "APPROVED", legalName: "Test Ltd", taxId: "515000008",
      businessAddress: {}, contactEmail: owner.email, contactPhone: "0500000000",
    },
  });
  shop = { id: created.id, status: created.status, ownerId: owner.id };
  customerId = (await db.user.create({ data: { email: `${TAG}-buyer@example.com` } })).id;
  leafCategoryId = (await db.category.findUniqueOrThrow({ where: { slug: "home-decor" } })).id;
});

afterAll(async () => {
  const subOrders = await db.subOrder.findMany({ where: { orderId: { in: orderIds } }, select: { id: true } });
  const subIds = subOrders.map((s) => s.id);
  await db.ledgerEntry.deleteMany({ where: { shopId: shop.id } });
  await db.returnRequest.deleteMany({ where: { subOrderId: { in: subIds } } });
  await db.refund.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.paymentEvent.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.emailLog.deleteMany({ where: { OR: [{ userId: { in: [customerId, shop.ownerId] } }, { to: { contains: TAG } }] } });
  await db.order.deleteMany({ where: { id: { in: orderIds } } });
  await db.discount.deleteMany({ where: { shopId: shop.id } });
  await db.product.deleteMany({ where: { shopId: shop.id } });
  await db.shop.delete({ where: { id: shop.id } });
  await db.user.deleteMany({ where: { id: { in: [customerId, shop.ownerId] } } });
  await db.$disconnect();
});

describe("saving products", () => {
  it("creates a live product with variants, images and its listing price", async () => {
    const result = await saveProduct(shop, productInput());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    productIds.push(result.id);
    const product = await db.product.findUniqueOrThrow({ where: { id: result.id }, include: { variants: true, images: true, brand: true } });
    expect(product).toMatchObject({ status: "ACTIVE", minPriceMinor: 10000, hasDeal: false, slug: `test-lamp-${TAG}` });
    expect(product.variants).toHaveLength(2);
    expect(product.brand?.name).toBe("Lumo");
    expect(product.specs).toEqual({ Power: "8W" });
  });

  it("refuses SKUs used by another product, outside images, and non-leaf categories", async () => {
    const other = productInput({ slug: "", variants: [{ attributes: {}, sku: `${TAG}-W`, priceMinor: 5000, compareAtMinor: null, stock: 1, isActive: true }] });
    expect(await saveProduct(shop, other)).toEqual({ ok: false, error: { code: "sku_taken", sku: `${TAG}-W`.toUpperCase() } });
    expect(await saveProduct(shop, productInput({ images: [{ url: "https://evil.example/x.jpg", alt: "" }] }))).toMatchObject({ ok: false, error: { code: "image_not_allowed" } });
    const parent = await db.category.findUniqueOrThrow({ where: { slug: "home-kitchen" } });
    expect(await saveProduct(shop, productInput({ categoryId: parent.id }))).toMatchObject({ ok: false, error: { code: "category_invalid" } });
  });

  it("updates variants: keeps by id, removes unordered ones", async () => {
    const product = await db.product.findUniqueOrThrow({ where: { id: productIds[0] }, include: { variants: { orderBy: { sku: "asc" } } } });
    const black = product.variants.find((v) => v.sku.endsWith("-B"))!;
    const result = await saveProduct(
      shop,
      productInput({ variants: [{ id: black.id, attributes: { color: "black" }, sku: black.sku, priceMinor: 9000, compareAtMinor: 11000, stock: 3, isActive: true }] }),
      product.id,
    );
    expect(result.ok).toBe(true);
    const after = await db.product.findUniqueOrThrow({ where: { id: product.id }, include: { variants: true } });
    expect(after.variants.map((v) => v.id)).toEqual([black.id]);
    expect(after).toMatchObject({ minPriceMinor: 9000, hasDeal: true });
  });

  it("won't let another shop edit the product", async () => {
    const otherShop = await db.shop.findFirstOrThrow({ where: { slug: "techzone" } });
    expect(await saveProduct(otherShop, productInput(), productIds[0])).toMatchObject({ ok: false, error: { code: "not_found" } });
  });
});

describe("discounts", () => {
  it("a shop-wide discount lowers listing prices, and ending it restores them", async () => {
    await saveProduct(shop, productInput({ variants: [{ attributes: {}, sku: `${TAG}-W`, priceMinor: 10000, compareAtMinor: null, stock: 10, isActive: true }] }), productIds[0]);
    const now = new Date();
    await createDiscount(shop.id, { productId: null, type: "PERCENT", value: 2500, startsAt: new Date(now.getTime() - 60_000), endsAt: new Date(now.getTime() + 3_600_000) });
    expect(await db.product.findUniqueOrThrow({ where: { id: productIds[0] } })).toMatchObject({ minPriceMinor: 7500, hasDeal: true });

    const discount = await db.discount.findFirstOrThrow({ where: { shopId: shop.id } });
    await endDiscount(shop.id, discount.id);
    expect(await db.product.findUniqueOrThrow({ where: { id: productIds[0] } })).toMatchObject({ minPriceMinor: 10000, hasDeal: false });
  });
});

describe("fulfilment", () => {
  it("moves through processing, shipped with tracking, and delivered", async () => {
    const variant = await db.productVariant.findFirstOrThrow({ where: { productId: productIds[0], isActive: true } });
    const { sub } = await paidOrderFor(variant.id);

    expect(await advanceSubOrder(shop.id, sub.id, "SHIPPED", shop.ownerId)).toEqual({ ok: false, error: "not_allowed" });
    expect(await advanceSubOrder(shop.id, sub.id, "PROCESSING", shop.ownerId)).toEqual({ ok: true });
    expect(await advanceSubOrder(shop.id, sub.id, "PROCESSING", shop.ownerId)).toEqual({ ok: false, error: "not_allowed" });
    expect(await advanceSubOrder(shop.id, sub.id, "SHIPPED", shop.ownerId, { carrier: "israel-post", trackingNumber: "RR123456789IL" })).toEqual({ ok: true });
    expect(await advanceSubOrder(shop.id, sub.id, "DELIVERED", shop.ownerId)).toEqual({ ok: true });

    const after = await db.subOrder.findUniqueOrThrow({ where: { id: sub.id }, include: { order: true } });
    expect(after).toMatchObject({ status: "DELIVERED", carrier: "israel-post", trackingNumber: "RR123456789IL" });
    expect(after.releaseAt!.getTime() - after.deliveredAt!.getTime()).toBe(14 * 86_400_000);
    expect(after.order.status).toBe("COMPLETED");

    // Money is held until the return window ends, then becomes available.
    expect((await balances(shop.id)).heldMinor).toBe(after.sellerNetMinor);
    await db.subOrder.update({ where: { id: sub.id }, data: { releaseAt: new Date(Date.now() - 1000) } });
    await releaseDueFunds();
    expect(await balances(shop.id)).toMatchObject({ heldMinor: 0, availableMinor: after.sellerNetMinor });
  });

  it("only the owning shop can update it", async () => {
    const variant = await db.productVariant.findFirstOrThrow({ where: { productId: productIds[0], isActive: true } });
    const { sub } = await paidOrderFor(variant.id);
    const otherShop = await db.shop.findFirstOrThrow({ where: { slug: "techzone" } });
    expect(await advanceSubOrder(otherShop.id, sub.id, "PROCESSING", shop.ownerId)).toEqual({ ok: false, error: "not_found" });
  });

  it("seller cancellation refunds in full and restocks", async () => {
    const variant = await db.productVariant.findFirstOrThrow({ where: { productId: productIds[0], isActive: true } });
    const { sub } = await paidOrderFor(variant.id);
    const stockBefore = (await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } })).stock;
    expect(await cancelBySeller(shop.id, sub.id, "out of stock", shop.ownerId)).toEqual({ ok: true });
    expect(await subStatus(sub.id)).toBe("CANCELLED");
    expect((await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } })).stock).toBe(stockBefore + 1);
  });

  it("archives instead of deleting a product that has orders", async () => {
    expect(await changeProductLifecycle(shop.id, productIds[0], "delete")).toEqual({ ok: true, archivedInstead: true });
    expect((await db.product.findUniqueOrThrow({ where: { id: productIds[0] } })).status).toBe("ARCHIVED");
    await changeProductLifecycle(shop.id, productIds[0], "restore");
  });
});

describe("returns", () => {
  async function deliveredOrder() {
    const variant = await db.productVariant.findFirstOrThrow({ where: { productId: productIds[0], isActive: true } });
    const { sub } = await paidOrderFor(variant.id);
    await advanceSubOrder(shop.id, sub.id, "PROCESSING", shop.ownerId);
    await advanceSubOrder(shop.id, sub.id, "SHIPPED", shop.ownerId, { carrier: "hfd", trackingNumber: "HFD-0001" });
    await advanceSubOrder(shop.id, sub.id, "DELIVERED", shop.ownerId);
    expect(await requestReturn(customerId, sub.id, "Wrong colour")).toEqual({ ok: true });
    const request = await db.returnRequest.findFirstOrThrow({ where: { subOrderId: sub.id } });
    return { sub, request, variant };
  }

  it("approve, then refund in full with restock", async () => {
    const { sub, request, variant } = await deliveredOrder();
    const stockBefore = (await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } })).stock;
    expect(await decideReturn(shop.id, request.id, { action: "approve" }, shop.ownerId)).toEqual({ ok: true });
    expect(await decideReturn(shop.id, request.id, { action: "refund", restock: true }, shop.ownerId)).toEqual({ ok: true });
    expect(await subStatus(sub.id)).toBe("REFUNDED");
    expect((await db.returnRequest.findUniqueOrThrow({ where: { id: request.id } })).status).toBe("REFUNDED");
    expect((await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } })).stock).toBe(stockBefore + 1);
  });

  it("partial refund closes the return as RETURNED", async () => {
    const { sub, request } = await deliveredOrder();
    expect(await decideReturn(shop.id, request.id, { action: "refund", amountMinor: 3000, restock: false }, shop.ownerId)).toEqual({ ok: true });
    expect(await subStatus(sub.id)).toBe("RETURNED");
  });

  it("reject sends it back to delivered", async () => {
    const { sub, request } = await deliveredOrder();
    expect(await decideReturn(shop.id, request.id, { action: "reject", note: "Item was used" }, shop.ownerId)).toEqual({ ok: true });
    expect(await subStatus(sub.id)).toBe("DELIVERED");
    expect(await decideReturn(shop.id, request.id, { action: "approve" }, shop.ownerId)).toEqual({ ok: false, error: "not_allowed" });
  });
});

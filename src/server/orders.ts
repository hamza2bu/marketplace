import "server-only";
import { db } from "@/server/db";
import { Prisma } from "@/generated/prisma/client";
import { getCartView, findCurrentCartId } from "@/server/cart";
import { getPlatformSettings } from "@/server/settings";
import { activeProvider } from "@/server/payments";
import { cancelUnpaidOrder, refundSubOrder, RefundError } from "@/server/payments/service";
import { generateOrderNumber, returnWindow } from "@/lib/order-status";
import { queueEmail } from "@/server/email";
import { resolveCommissionBps, splitOrder, type SplitLine } from "@/lib/pricing";
import { absoluteUrl } from "@/lib/site";
import type { CurrentUser } from "@/server/auth/guards";

export type PlaceOrderError =
  | "empty_cart"
  | "cart_changed"
  | "address_not_found"
  | "out_of_stock"
  | "already_placed"
  | "payment_unavailable";

class CheckoutAbort extends Error {
  constructor(public code: PlaceOrderError) {
    super(code);
  }
}

/** Commission rate per category id, walking up the tree for unset rates. */
async function commissionResolver(globalBps: number) {
  const categories = await db.category.findMany({ select: { id: true, parentId: true, commissionBps: true } });
  const byId = new Map(categories.map((c) => [c.id, c]));
  return (categoryId: string, shopOverrideBps: number | null) => {
    const chain: { commissionBps: number | null }[] = [];
    for (let c = byId.get(categoryId); c && chain.length < 10; c = c.parentId ? byId.get(c.parentId) : undefined) chain.push(c);
    return resolveCommissionBps(shopOverrideBps, chain, globalBps);
  };
}

/**
 * Turns the cart into an order: reserves stock, snapshots prices and
 * commission, splits it per seller, and starts the payment. Returns where to
 * send the customer to pay.
 */
export async function placeOrder(
  user: CurrentUser,
  input: { addressId: string; checkoutToken: string; locale: string },
): Promise<{ ok: true; redirectUrl: string; orderNumber: string } | { ok: false; error: PlaceOrderError; orderNumber?: string }> {
  const existing = await db.order.findUnique({ where: { checkoutToken: input.checkoutToken }, select: { number: true, customerId: true } });
  if (existing) return { ok: false, error: "already_placed", orderNumber: existing.customerId === user.id ? existing.number : undefined };

  const address = await db.address.findFirst({ where: { id: input.addressId, userId: user.id } });
  if (!address) return { ok: false, error: "address_not_found" };

  const cart = await getCartView(await findCurrentCartId());
  if (cart.itemCount === 0 || cart.groups.length === 0) return { ok: false, error: "empty_cart" };
  if (cart.hasIssues) return { ok: false, error: "cart_changed" };

  const settings = await getPlatformSettings();
  const commissionFor = await commissionResolver(settings.globalCommissionBps);
  const lines = cart.groups.flatMap((g) => g.lines);
  const variants = await db.productVariant.findMany({
    where: { id: { in: lines.map((l) => l.variantId) } },
    select: {
      id: true,
      sku: true,
      priceMinor: true,
      productId: true,
      product: { select: { categoryId: true, shop: { select: { id: true, commissionBpsOverride: true } } } },
    },
  });
  const variantById = new Map(variants.map((v) => [v.id, v]));

  const orderLines = lines.map((line) => {
    const v = variantById.get(line.variantId)!;
    return { line, variant: v, commissionBps: commissionFor(v.product.categoryId, v.product.shop.commissionBpsOverride) };
  });
  const split = splitOrder(
    orderLines.map<SplitLine>(({ line, variant, commissionBps }) => ({
      shopId: variant.product.shop.id,
      unitPriceMinor: line.unitPriceMinor,
      quantity: line.quantity,
      commissionBps,
    })),
    settings,
  );

  const now = new Date();
  let order: { id: string; number: string };
  try {
    order = await db.$transaction(async (tx) => {
      // One pending order per customer: release stock held by an abandoned attempt.
      const abandoned = await tx.order.findMany({ where: { customerId: user.id, status: "PENDING_PAYMENT" }, select: { id: true } });
      for (const o of abandoned) await cancelUnpaidOrder(tx, o.id, "replaced_by_new_checkout");

      for (const { line } of orderLines) {
        const { count } = await tx.productVariant.updateMany({
          // Also fails if the seller changed the price since the cart was read.
          where: { id: line.variantId, isActive: true, stock: { gte: line.quantity }, priceMinor: line.basePriceMinor },
          data: { stock: { decrement: line.quantity } },
        });
        if (count === 0) throw new CheckoutAbort("out_of_stock");
      }

      for (let attempt = 0; ; attempt++) {
        try {
          return await tx.order.create({
            data: {
              number: generateOrderNumber(now),
              customerId: user.id,
              checkoutToken: input.checkoutToken,
              currency: settings.currency,
              subtotalMinor: split.subtotalMinor,
              shippingMinor: split.shippingMinor,
              vatMinor: split.vatMinor,
              totalMinor: split.totalMinor,
              expiresAt: new Date(now.getTime() + settings.paymentWindowMinutes * 60_000),
              shippingAddress: {
                fullName: address.fullName,
                phone: address.phone,
                line1: address.line1,
                line2: address.line2,
                city: address.city,
                postalCode: address.postalCode,
                country: address.country,
              },
              subOrders: {
                create: split.shops.map((s) => ({
                    shopId: s.shopId,
                    subtotalMinor: s.subtotalMinor,
                    shippingMinor: s.shippingMinor,
                    commissionMinor: s.commissionMinor,
                    sellerNetMinor: s.sellerNetMinor,
                    events: { create: { status: "PENDING" as const } },
                    items: {
                      create: orderLines
                        .filter(({ variant }) => variant.product.shop.id === s.shopId)
                        .map(({ line, variant, commissionBps }) => ({
                          variantId: variant.id,
                          productId: variant.productId,
                          titleSnapshot: line.title,
                          skuSnapshot: variant.sku,
                          imageSnapshot: line.imageUrl,
                          attributes: line.attributes,
                          unitPriceMinor: line.unitPriceMinor,
                          quantity: line.quantity,
                          commissionBps,
                          lineTotalMinor: line.lineTotalMinor,
                        })),
                    },
                })),
              },
            },
            select: { id: true, number: true },
          });
        } catch (error) {
          // Order number collision: try another.
          if (attempt < 3 && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" && String(error.meta?.target).includes("number")) continue;
          throw error;
        }
      }
    });
  } catch (error) {
    if (error instanceof CheckoutAbort) return { ok: false, error: error.code };
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { ok: false, error: "already_placed" };
    throw error;
  }

  try {
    const provider = activeProvider();
    const payment = await provider.createPayment({
      orderId: order.id,
      orderNumber: order.number,
      amountMinor: split.totalMinor,
      currency: settings.currency,
      description: order.number,
      customer: { name: user.name, email: user.email },
      locale: input.locale,
      successUrl: absoluteUrl(`/${input.locale}/checkout/complete?order=${order.number}`),
      cancelUrl: absoluteUrl(`/${input.locale}/checkout/complete?order=${order.number}`),
      webhookUrl: absoluteUrl(`/api/webhooks/payments/${provider.id}`),
    });
    await db.order.update({ where: { id: order.id }, data: { paymentProvider: provider.id, paymentRef: payment.paymentRef } });
    return { ok: true, redirectUrl: payment.redirectUrl, orderNumber: order.number };
  } catch (error) {
    console.error("[checkout] could not start payment", error);
    await db.$transaction((tx) => cancelUnpaidOrder(tx, order.id, "payment_start_failed"));
    return { ok: false, error: "payment_unavailable" };
  }
}

// ───────────────────────── Customer views ─────────────────────────

export async function getCustomerOrders(userId: string, page = 1, pageSize = 10) {
  const [orders, total] = await Promise.all([
    db.order.findMany({
      where: { customerId: userId },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        number: true,
        status: true,
        totalMinor: true,
        createdAt: true,
        subOrders: { select: { items: { select: { imageSnapshot: true, titleSnapshot: true }, take: 3 } } },
      },
    }),
    db.order.count({ where: { customerId: userId } }),
  ]);
  return { orders, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getCustomerOrder(userId: string, number: string) {
  const [order, settings] = await Promise.all([findCustomerOrder(userId, number), getPlatformSettings()]);
  if (!order) return null;
  const now = new Date();
  return {
    ...order,
    subOrders: order.subOrders.map((sub) => ({ ...sub, returns: returnWindow(sub, settings.returnWindowDays, now) })),
  };
}

function findCustomerOrder(userId: string, number: string) {
  return db.order.findFirst({
    where: { number, customerId: userId },
    include: {
      subOrders: {
        orderBy: { createdAt: "asc" },
        include: {
          shop: { select: { name: true, slug: true } },
          items: { include: { review: { select: { id: true, rating: true, title: true, body: true } } } },
          events: { orderBy: { createdAt: "asc" } },
          returnRequests: { orderBy: { createdAt: "desc" } },
          refunds: { where: { status: "SUCCEEDED" }, select: { amountMinor: true, createdAt: true } },
          disputes: { orderBy: { createdAt: "desc" }, select: { id: true, status: true, messages: true, resolution: true } },
        },
      },
      refunds: { where: { status: "SUCCEEDED", subOrderId: null }, select: { amountMinor: true } },
    },
  });
}

export type CustomerOrder = NonNullable<Awaited<ReturnType<typeof getCustomerOrder>>>;

// ───────────────────────── Customer actions ─────────────────────────

export type CustomerActionError = "not_found" | "not_allowed" | "refund_failed";

/** Cancels the customer's unpaid order. */
export async function cancelPendingOrder(userId: string, orderId: string): Promise<{ ok: boolean; error?: CustomerActionError }> {
  const order = await db.order.findFirst({ where: { id: orderId, customerId: userId }, select: { id: true } });
  if (!order) return { ok: false, error: "not_found" };
  const cancelled = await db.$transaction((tx) => cancelUnpaidOrder(tx, order.id, "cancelled_by_customer"));
  return cancelled ? { ok: true } : { ok: false, error: "not_allowed" };
}

/** Cancels one seller's part before it is shipped, with a full refund. */
export async function cancelSubOrderByCustomer(userId: string, subOrderId: string): Promise<{ ok: boolean; error?: CustomerActionError }> {
  const subOrder = await db.subOrder.findFirst({ where: { id: subOrderId, order: { customerId: userId } }, select: { id: true, status: true } });
  if (!subOrder) return { ok: false, error: "not_found" };
  if (subOrder.status !== "PAID") return { ok: false, error: "not_allowed" };
  try {
    await refundSubOrder({ subOrderId, reason: "cancelled_by_customer", actorId: userId, restock: true, finalStatus: "CANCELLED" });
    return { ok: true };
  } catch (error) {
    if (error instanceof RefundError) return { ok: false, error: error.code === "provider_failed" ? "refund_failed" : "not_allowed" };
    throw error;
  }
}

/** Opens a return for a delivered sub-order, within the return window. The seller handles it next. */
export async function requestReturn(
  userId: string,
  subOrderId: string,
  reason: string,
): Promise<{ ok: boolean; error?: CustomerActionError }> {
  const [subOrder, settings] = await Promise.all([
    db.subOrder.findFirst({
      where: { id: subOrderId, order: { customerId: userId } },
      select: { id: true, status: true, deliveredAt: true, items: { select: { id: true, quantity: true } }, shop: { select: { contactEmail: true, ownerId: true } } },
    }),
    getPlatformSettings(),
  ]);
  if (!subOrder) return { ok: false, error: "not_found" };
  const windowEnds = subOrder.deliveredAt ? subOrder.deliveredAt.getTime() + settings.returnWindowDays * 86_400_000 : 0;
  if (subOrder.status !== "DELIVERED" || Date.now() > windowEnds) return { ok: false, error: "not_allowed" };

  await db.$transaction(async (tx) => {
    const { count } = await tx.subOrder.updateMany({ where: { id: subOrder.id, status: "DELIVERED" }, data: { status: "RETURN_REQUESTED" } });
    if (count === 0) return;
    await tx.returnRequest.create({
      data: { subOrderId: subOrder.id, reason, items: subOrder.items.map((i) => ({ orderItemId: i.id, quantity: i.quantity })) },
    });
    await tx.orderEvent.create({ data: { subOrderId: subOrder.id, status: "RETURN_REQUESTED", note: reason, actorId: userId } });
    await queueEmail(tx, { to: subOrder.shop.contactEmail, userId: subOrder.shop.ownerId, template: "seller-return-requested", payload: { subOrderId: subOrder.id } });
  });
  return { ok: true };
}

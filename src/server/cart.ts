import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/server/db";
import { getCurrentUser } from "@/server/auth/guards";
import { getPlatformSettings } from "@/server/settings";
import { effectivePrice, includedVat, shippingFor } from "@/lib/pricing";
import { discountSelects } from "@/server/discounts";

const CART_COOKIE = "cart";
const CART_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
export const MAX_LINE_QUANTITY = 20;

// ───────────────────────── Identity ─────────────────────────

/** The current visitor's cart, or null. Safe to call while rendering (never writes cookies). */
async function findCartId(): Promise<string | null> {
  const user = await getCurrentUser();
  if (user) return (await db.cart.findUnique({ where: { userId: user.id }, select: { id: true } }))?.id ?? null;
  const token = (await cookies()).get(CART_COOKIE)?.value;
  if (!token) return null;
  return (await db.cart.findUnique({ where: { guestToken: token }, select: { id: true } }))?.id ?? null;
}

/** The current visitor's cart, created if needed. Server actions only (may set a cookie). */
async function getOrCreateCartId(): Promise<string> {
  const user = await getCurrentUser();
  if (user) {
    const cart = await db.cart.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id }, select: { id: true } });
    return cart.id;
  }
  const jar = await cookies();
  let token = jar.get(CART_COOKIE)?.value;
  if (!token || token.length > 64) {
    token = randomBytes(24).toString("base64url");
  }
  jar.set(CART_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CART_COOKIE_MAX_AGE,
  });
  const cart = await db.cart.upsert({ where: { guestToken: token }, update: {}, create: { guestToken: token }, select: { id: true } });
  return cart.id;
}

/** Moves a guest cart into the user's cart after sign-in. Server actions only. */
export async function mergeGuestCart(userId: string): Promise<void> {
  const jar = await cookies();
  const token = jar.get(CART_COOKIE)?.value;
  if (!token) return;
  jar.delete(CART_COOKIE);

  const guest = await db.cart.findUnique({ where: { guestToken: token }, include: { items: true } });
  if (!guest) return;
  await db.$transaction(async (tx) => {
    const cart = await tx.cart.upsert({ where: { userId }, update: {}, create: { userId }, select: { id: true } });
    for (const item of guest.items) {
      const existing = await tx.cartItem.findUnique({ where: { cartId_variantId: { cartId: cart.id, variantId: item.variantId } } });
      const quantity = Math.min(MAX_LINE_QUANTITY, (existing?.quantity ?? 0) + item.quantity);
      await tx.cartItem.upsert({
        where: { cartId_variantId: { cartId: cart.id, variantId: item.variantId } },
        update: { quantity },
        create: { cartId: cart.id, variantId: item.variantId, quantity },
      });
    }
    await tx.cart.delete({ where: { id: guest.id } });
  });
}

// ───────────────────────── Reading ─────────────────────────

export type CartIssue = "unavailable" | "out_of_stock" | "insufficient_stock";

export type CartLine = {
  id: string;
  variantId: string;
  quantity: number;
  stock: number;
  productSlug: string;
  title: string;
  attributes: Record<string, string>;
  imageUrl: string | null;
  unitPriceMinor: number; // after discounts: what the customer pays
  basePriceMinor: number; // the variant's regular price
  compareAtMinor: number | null;
  lineTotalMinor: number;
  issue: CartIssue | null;
};

export type CartGroup = {
  shop: { id: string; name: string; slug: string };
  lines: CartLine[];
  subtotalMinor: number;
  shippingMinor: number;
};

export type CartView = {
  groups: CartGroup[];
  itemCount: number;
  subtotalMinor: number;
  shippingMinor: number;
  totalMinor: number;
  vatMinor: number;
  hasIssues: boolean;
  freeShippingOverMinor: number;
};

const EMPTY: Omit<CartView, "freeShippingOverMinor"> = {
  groups: [],
  itemCount: 0,
  subtotalMinor: 0,
  shippingMinor: 0,
  totalMinor: 0,
  vatMinor: 0,
  hasIssues: false,
};

export async function getCartItemCount(): Promise<number> {
  const cartId = await findCartId();
  if (!cartId) return 0;
  const result = await db.cartItem.aggregate({ where: { cartId }, _sum: { quantity: true } });
  return result._sum.quantity ?? 0;
}

/** The cart with current prices and stock. Lines with an issue don't count toward totals. */
export async function getCartView(cartId?: string | null): Promise<CartView> {
  const settings = await getPlatformSettings();
  const id = cartId === undefined ? await findCartId() : cartId;
  if (!id) return { ...EMPTY, freeShippingOverMinor: settings.freeShippingOverMinor };

  const now = new Date();
  const discounts = discountSelects(now);
  const items = await db.cartItem.findMany({
    where: { cartId: id },
    orderBy: { id: "asc" },
    include: {
      variant: {
        include: {
          product: {
            select: {
              slug: true,
              title: true,
              status: true,
              discounts: discounts.product,
              shop: { select: { id: true, name: true, slug: true, status: true, discounts: discounts.shop } },
              images: { select: { url: true }, orderBy: { position: "asc" }, take: 1 },
            },
          },
        },
      },
    },
  });

  const groups = new Map<string, CartGroup>();
  for (const item of items) {
    const { variant } = item;
    const { product } = variant;
    const available = variant.isActive && product.status === "ACTIVE" && product.shop.status === "APPROVED";
    const issue: CartIssue | null = !available
      ? "unavailable"
      : variant.stock <= 0
        ? "out_of_stock"
        : item.quantity > variant.stock
          ? "insufficient_stock"
          : null;

    const price = effectivePrice(variant, variant.productId, [...product.discounts, ...product.shop.discounts], now);
    const line: CartLine = {
      id: item.id,
      variantId: variant.id,
      quantity: item.quantity,
      stock: Math.max(0, variant.stock),
      productSlug: product.slug,
      title: product.title,
      attributes: variant.attributes as Record<string, string>,
      imageUrl: product.images[0]?.url ?? null,
      unitPriceMinor: price.priceMinor,
      basePriceMinor: variant.priceMinor,
      compareAtMinor: price.compareAtMinor,
      lineTotalMinor: price.priceMinor * item.quantity,
      issue,
    };
    const group = groups.get(product.shop.id) ?? {
      shop: { id: product.shop.id, name: product.shop.name, slug: product.shop.slug },
      lines: [],
      subtotalMinor: 0,
      shippingMinor: 0,
    };
    group.lines.push(line);
    if (!issue) group.subtotalMinor += line.lineTotalMinor;
    groups.set(product.shop.id, group);
  }

  const list = [...groups.values()];
  for (const group of list) group.shippingMinor = shippingFor(group.subtotalMinor, settings);
  const subtotalMinor = list.reduce((n, g) => n + g.subtotalMinor, 0);
  const shippingMinor = list.reduce((n, g) => n + g.shippingMinor, 0);
  const totalMinor = subtotalMinor + shippingMinor;

  return {
    groups: list,
    itemCount: items.reduce((n, i) => n + i.quantity, 0),
    subtotalMinor,
    shippingMinor,
    totalMinor,
    vatMinor: includedVat(totalMinor, settings.vatBps),
    hasIssues: list.some((g) => g.lines.some((l) => l.issue)),
    freeShippingOverMinor: settings.freeShippingOverMinor,
  };
}

// ───────────────────────── Changing ─────────────────────────

export type CartError = "not_found" | "unavailable" | "out_of_stock" | "invalid_quantity";

/** Adds to the cart, capping at stock and MAX_LINE_QUANTITY. */
export async function addToCart(variantId: string, quantity: number): Promise<{ ok: true; quantity: number } | { ok: false; error: CartError }> {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_LINE_QUANTITY) return { ok: false, error: "invalid_quantity" };

  const variant = await db.productVariant.findUnique({
    where: { id: variantId },
    select: { stock: true, isActive: true, product: { select: { status: true, shop: { select: { status: true } } } } },
  });
  if (!variant) return { ok: false, error: "not_found" };
  if (!variant.isActive || variant.product.status !== "ACTIVE" || variant.product.shop.status !== "APPROVED") {
    return { ok: false, error: "unavailable" };
  }
  if (variant.stock <= 0) return { ok: false, error: "out_of_stock" };

  const cartId = await getOrCreateCartId();
  const existing = await db.cartItem.findUnique({ where: { cartId_variantId: { cartId, variantId } } });
  const next = Math.min(MAX_LINE_QUANTITY, variant.stock, (existing?.quantity ?? 0) + quantity);
  await db.cartItem.upsert({
    where: { cartId_variantId: { cartId, variantId } },
    update: { quantity: next },
    create: { cartId, variantId, quantity: next },
  });
  return { ok: true, quantity: next };
}

/** Sets a line's quantity (0 removes it). Only touches lines in the visitor's own cart. */
export async function setCartItemQuantity(itemId: string, quantity: number): Promise<{ ok: boolean }> {
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > MAX_LINE_QUANTITY) return { ok: false };
  const cartId = await findCartId();
  if (!cartId) return { ok: false };
  if (quantity === 0) {
    const { count } = await db.cartItem.deleteMany({ where: { id: itemId, cartId } });
    return { ok: count > 0 };
  }
  const { count } = await db.cartItem.updateMany({ where: { id: itemId, cartId }, data: { quantity } });
  return { ok: count > 0 };
}

export async function findCurrentCartId() {
  return findCartId();
}

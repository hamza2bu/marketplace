// Pure money math for carts, orders, commissions and refunds. All amounts
// are integer agorot; rates are basis points (1% = 100 bps). Prices include VAT.

export type PricingSettings = {
  globalCommissionBps: number;
  vatBps: number;
  shippingFlatMinor: number;
  freeShippingOverMinor: number;
};

/** Shipping charged by one seller for their part of the order. */
export function shippingFor(subtotalMinor: number, settings: PricingSettings): number {
  if (subtotalMinor <= 0) return 0;
  return subtotalMinor >= settings.freeShippingOverMinor ? 0 : settings.shippingFlatMinor;
}

/** VAT contained in a VAT-inclusive amount: total − total / (1 + rate). */
export function includedVat(totalMinor: number, vatBps: number): number {
  return totalMinor - Math.round((totalMinor * 10_000) / (10_000 + vatBps));
}

/** Basis points of an amount, rounded half up to the nearest agora. */
export function bpsOf(amountMinor: number, bps: number): number {
  return Math.round((amountMinor * bps) / 10_000);
}

/**
 * Commission rate for a product: the shop's negotiated rate wins, then the
 * nearest category up the tree that sets one, then the platform default.
 * `categoryChain` is ordered from the product's own category up to the root.
 */
export function resolveCommissionBps(
  shopOverrideBps: number | null | undefined,
  categoryChain: { commissionBps: number | null }[],
  globalBps: number,
): number {
  if (shopOverrideBps !== null && shopOverrideBps !== undefined) return shopOverrideBps;
  for (const category of categoryChain) if (category.commissionBps !== null) return category.commissionBps;
  return globalBps;
}

export type SplitLine = {
  shopId: string;
  unitPriceMinor: number;
  quantity: number;
  commissionBps: number;
};

export type ShopSplit = {
  shopId: string;
  subtotalMinor: number;
  shippingMinor: number;
  commissionMinor: number;
  sellerNetMinor: number; // what the seller receives: subtotal + shipping − commission
};

export type OrderSplit = {
  shops: ShopSplit[];
  subtotalMinor: number;
  shippingMinor: number;
  totalMinor: number;
  vatMinor: number;
  commissionMinor: number;
};

/**
 * Splits one customer payment into per-shop parts. Commission is taken on
 * item prices only; shipping goes to the seller who ships. The parts always
 * add up exactly to the total the customer pays.
 */
export function splitOrder(lines: SplitLine[], settings: PricingSettings): OrderSplit {
  const byShop = new Map<string, SplitLine[]>();
  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) throw new Error("Invalid quantity");
    byShop.set(line.shopId, [...(byShop.get(line.shopId) ?? []), line]);
  }

  const shops = [...byShop].map(([shopId, shopLines]): ShopSplit => {
    const subtotalMinor = shopLines.reduce((sum, l) => sum + l.unitPriceMinor * l.quantity, 0);
    const commissionMinor = shopLines.reduce((sum, l) => sum + bpsOf(l.unitPriceMinor * l.quantity, l.commissionBps), 0);
    const shippingMinor = shippingFor(subtotalMinor, settings);
    return { shopId, subtotalMinor, shippingMinor, commissionMinor, sellerNetMinor: subtotalMinor + shippingMinor - commissionMinor };
  });

  const subtotalMinor = shops.reduce((sum, s) => sum + s.subtotalMinor, 0);
  const shippingMinor = shops.reduce((sum, s) => sum + s.shippingMinor, 0);
  const totalMinor = subtotalMinor + shippingMinor;
  return {
    shops,
    subtotalMinor,
    shippingMinor,
    totalMinor,
    vatMinor: includedVat(totalMinor, settings.vatBps),
    commissionMinor: shops.reduce((sum, s) => sum + s.commissionMinor, 0),
  };
}

export type RefundSplit = {
  refundMinor: number; // returned to the customer
  commissionReturnedMinor: number; // commission the platform gives back
  sellerDebitMinor: number; // taken back from the seller
};

/**
 * How a refund on one sub-order is shared. The platform returns commission
 * in proportion to the refunded share of the sub-order, so a full refund
 * leaves both sides at zero.
 */
export function splitRefund(
  subOrder: { subtotalMinor: number; shippingMinor: number; commissionMinor: number },
  alreadyRefundedMinor: number,
  refundMinor: number,
): RefundSplit {
  const paid = subOrder.subtotalMinor + subOrder.shippingMinor;
  const refundable = paid - alreadyRefundedMinor;
  if (!Number.isInteger(refundMinor) || refundMinor <= 0) throw new Error("Refund must be a positive amount");
  if (refundMinor > refundable) throw new Error("Refund exceeds the refundable amount");

  // Compute cumulatively so rounding never leaves a stray agora after several partial refunds.
  const commissionBefore = Math.round((subOrder.commissionMinor * alreadyRefundedMinor) / paid);
  const commissionAfter = Math.round((subOrder.commissionMinor * (alreadyRefundedMinor + refundMinor)) / paid);
  const commissionReturnedMinor = commissionAfter - commissionBefore;
  return { refundMinor, commissionReturnedMinor, sellerDebitMinor: refundMinor - commissionReturnedMinor };
}

import { describe, expect, it } from "vitest";
import { bpsOf, includedVat, resolveCommissionBps, shippingFor, splitOrder, splitRefund } from "@/lib/pricing";

const settings = { globalCommissionBps: 1000, vatBps: 1800, shippingFlatMinor: 2990, freeShippingOverMinor: 19900 };

describe("shippingFor", () => {
  it("charges the flat rate below the threshold and nothing at or above it", () => {
    expect(shippingFor(19899, settings)).toBe(2990);
    expect(shippingFor(19900, settings)).toBe(0);
    expect(shippingFor(0, settings)).toBe(0);
  });
});

describe("includedVat", () => {
  it("extracts 18% VAT from a VAT-inclusive price", () => {
    expect(includedVat(11800, 1800)).toBe(1800);
    expect(includedVat(12990, 1800)).toBe(1982); // 12990 − round(12990 / 1.18 = 11008.47)
  });
});

describe("bpsOf", () => {
  it("rounds to the nearest agora", () => {
    expect(bpsOf(12990, 1500)).toBe(1949); // 1948.5 → 1949
    expect(bpsOf(3990, 800)).toBe(319);
  });
});

describe("resolveCommissionBps", () => {
  const chain = [{ commissionBps: null }, { commissionBps: 1200 }];
  it("prefers the shop override, then the nearest category, then the global rate", () => {
    expect(resolveCommissionBps(500, chain, 1000)).toBe(500);
    expect(resolveCommissionBps(0, chain, 1000)).toBe(0);
    expect(resolveCommissionBps(null, chain, 1000)).toBe(1200);
    expect(resolveCommissionBps(null, [{ commissionBps: null }], 1000)).toBe(1000);
  });
});

describe("splitOrder", () => {
  const lines = [
    { shopId: "tech", unitPriceMinor: 3990, quantity: 2, commissionBps: 800 },
    { shopId: "tech", unitPriceMinor: 12990, quantity: 1, commissionBps: 800 },
    { shopId: "fashion", unitPriceMinor: 8990, quantity: 1, commissionBps: 1500 },
  ];

  it("groups lines per shop with shipping and commission", () => {
    const split = splitOrder(lines, settings);
    expect(split.shops).toEqual([
      { shopId: "tech", subtotalMinor: 20970, shippingMinor: 0, commissionMinor: 638 + 1039, sellerNetMinor: 20970 - 1677 },
      { shopId: "fashion", subtotalMinor: 8990, shippingMinor: 2990, commissionMinor: 1349, sellerNetMinor: 8990 + 2990 - 1349 },
    ]);
    expect(split.totalMinor).toBe(20970 + 8990 + 2990);
  });

  it("always adds up: seller nets + commission = what the customer pays", () => {
    const split = splitOrder(lines, settings);
    const nets = split.shops.reduce((n, s) => n + s.sellerNetMinor, 0);
    expect(nets + split.commissionMinor).toBe(split.totalMinor);
    expect(split.vatMinor).toBe(includedVat(split.totalMinor, 1800));
  });

  it("rejects bad quantities", () => {
    expect(() => splitOrder([{ ...lines[0], quantity: 0 }], settings)).toThrow();
    expect(() => splitOrder([{ ...lines[0], quantity: 1.5 }], settings)).toThrow();
  });
});

describe("splitRefund", () => {
  const subOrder = { subtotalMinor: 8990, shippingMinor: 2990, commissionMinor: 1349 };

  it("returns all commission on a full refund", () => {
    expect(splitRefund(subOrder, 0, 11980)).toEqual({ refundMinor: 11980, commissionReturnedMinor: 1349, sellerDebitMinor: 10631 });
  });

  it("partial refunds add up exactly to a full refund", () => {
    const parts = [3333, 3333, 5314].reduce<{ done: number; commission: number }>(
      (acc, amount) => {
        const r = splitRefund(subOrder, acc.done, amount);
        return { done: acc.done + amount, commission: acc.commission + r.commissionReturnedMinor };
      },
      { done: 0, commission: 0 },
    );
    expect(parts).toEqual({ done: 11980, commission: 1349 });
  });

  it("refuses to refund more than was paid", () => {
    expect(() => splitRefund(subOrder, 10000, 2000)).toThrow();
    expect(() => splitRefund(subOrder, 0, 0)).toThrow();
  });
});

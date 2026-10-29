import { describe, expect, it } from "vitest";
import { applyDiscount, effectivePrice, isDiscountLive, type DiscountRule } from "@/lib/pricing";
import { isValidIsraeliId } from "@/lib/israeli-id";

const now = new Date("2026-10-30T12:00:00Z");
const rule = (over: Partial<DiscountRule>): DiscountRule => ({
  type: "PERCENT",
  value: 2000,
  productId: null,
  startsAt: new Date("2026-10-01"),
  endsAt: new Date("2026-11-01"),
  isActive: true,
  ...over,
});

describe("applyDiscount", () => {
  it("applies percent and fixed discounts", () => {
    expect(applyDiscount(10000, { type: "PERCENT", value: 2000 })).toBe(8000);
    expect(applyDiscount(10000, { type: "FIXED", value: 2500 })).toBe(7500);
  });
  it("never goes below ₪1 (or the original price if lower)", () => {
    expect(applyDiscount(3990, { type: "FIXED", value: 5000 })).toBe(100);
    expect(applyDiscount(50, { type: "FIXED", value: 5000 })).toBe(50);
  });
});

describe("isDiscountLive", () => {
  it("respects dates and the active flag", () => {
    expect(isDiscountLive(rule({}), now)).toBe(true);
    expect(isDiscountLive(rule({ isActive: false }), now)).toBe(false);
    expect(isDiscountLive(rule({ startsAt: new Date("2026-11-01") }), now)).toBe(false);
    expect(isDiscountLive(rule({ endsAt: now }), now)).toBe(false);
  });
});

describe("effectivePrice", () => {
  const variant = { priceMinor: 10000, compareAtMinor: null };

  it("picks the best live discount for this product or the whole shop", () => {
    const rules = [rule({ value: 1000 }), rule({ productId: "p1", type: "FIXED", value: 3000 }), rule({ productId: "p2", value: 9000 })];
    expect(effectivePrice(variant, "p1", rules, now)).toEqual({ priceMinor: 7000, compareAtMinor: 10000, discounted: true });
    expect(effectivePrice(variant, "p3", rules, now)).toEqual({ priceMinor: 9000, compareAtMinor: 10000, discounted: true });
  });

  it("keeps a higher compare-at price as the 'was' price", () => {
    expect(effectivePrice({ priceMinor: 10000, compareAtMinor: 15000 }, "p1", [rule({})], now).compareAtMinor).toBe(15000);
    expect(effectivePrice({ priceMinor: 10000, compareAtMinor: 15000 }, "p1", [], now)).toEqual({
      priceMinor: 10000,
      compareAtMinor: 15000,
      discounted: false,
    });
  });

  it("ignores a compare-at price that isn't higher", () => {
    expect(effectivePrice({ priceMinor: 10000, compareAtMinor: 9000 }, "p1", [], now).compareAtMinor).toBeNull();
  });
});

describe("isValidIsraeliId", () => {
  it.each(["000000018", "123456782", "515000008", "39337423"])("accepts %s", (id) => expect(isValidIsraeliId(id)).toBe(true));
  it.each(["123456789", "000000000", "12a456789", "1234", "1234567890"])("rejects %s", (id) => expect(isValidIsraeliId(id)).toBe(false));
});

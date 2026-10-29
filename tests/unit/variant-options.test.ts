import { describe, expect, it } from "vitest";
import { findVariant, isValueAvailable, optionAxes, priceSummary, type VariantLike } from "@/lib/variant-options";

const v = (id: string, attributes: Record<string, string>, stock: number, priceMinor = 1000, compareAtMinor: number | null = null): VariantLike => ({
  id,
  attributes,
  stock,
  priceMinor,
  compareAtMinor,
});

const variants = [
  v("s-black", { size: "S", color: "black" }, 3),
  v("s-white", { size: "S", color: "white" }, 0),
  v("m-black", { size: "M", color: "black" }, 1),
];

describe("variant options", () => {
  it("lists option axes and values in order", () => {
    expect(optionAxes(variants)).toEqual([
      { name: "size", values: ["S", "M"] },
      { name: "color", values: ["black", "white"] },
    ]);
  });

  it("finds the variant for a selection", () => {
    expect(findVariant(variants, { size: "M", color: "black" })?.id).toBe("m-black");
    expect(findVariant(variants, { size: "M", color: "white" })).toBeUndefined();
  });

  it("marks values unavailable when no in-stock variant matches the rest of the selection", () => {
    expect(isValueAvailable(variants, { size: "S", color: "black" }, "color", "white")).toBe(false);
    expect(isValueAvailable(variants, { size: "S", color: "black" }, "size", "M")).toBe(true);
  });
});

describe("priceSummary", () => {
  it("uses the cheapest variant and only real markdowns", () => {
    expect(priceSummary([v("a", {}, 0, 5000, 8000), v("b", {}, 2, 4000, 3000)])).toEqual({
      price: 4000,
      compareAt: null,
      inStock: true,
      discountPct: 0,
    });
    expect(priceSummary([v("a", {}, 1, 7500, 10000)])).toMatchObject({ compareAt: 10000, discountPct: 25 });
  });

  it("handles products without variants", () => {
    expect(priceSummary([])).toMatchObject({ price: 0, inStock: false });
  });
});

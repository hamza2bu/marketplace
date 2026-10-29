export type VariantLike = {
  id: string;
  attributes: Record<string, string>;
  priceMinor: number;
  compareAtMinor: number | null;
  stock: number;
};

/** Option axes in first-seen order: [{ name: "color", values: ["black", "white"] }]. */
export function optionAxes(variants: VariantLike[]): { name: string; values: string[] }[] {
  const axes = new Map<string, string[]>();
  for (const v of variants) {
    for (const [name, value] of Object.entries(v.attributes)) {
      const values = axes.get(name) ?? [];
      if (!values.includes(value)) values.push(value);
      axes.set(name, values);
    }
  }
  return [...axes].map(([name, values]) => ({ name, values }));
}

export function findVariant<T extends VariantLike>(variants: T[], selection: Record<string, string>): T | undefined {
  return variants.find((v) => Object.entries(v.attributes).every(([k, val]) => selection[k] === val));
}

/** Whether any in-stock variant has `value` on `axis` while matching the other selected axes. */
export function isValueAvailable(
  variants: VariantLike[],
  selection: Record<string, string>,
  axis: string,
  value: string,
): boolean {
  return variants.some(
    (v) =>
      v.stock > 0 &&
      v.attributes[axis] === value &&
      Object.entries(selection).every(([k, val]) => k === axis || v.attributes[k] === val),
  );
}

/** Lowest price, and the compare-at price of that variant if it is an actual markdown. */
export function priceSummary(variants: Pick<VariantLike, "priceMinor" | "compareAtMinor" | "stock">[]) {
  if (variants.length === 0) return { price: 0, compareAt: null, inStock: false, discountPct: 0 };
  const cheapest = variants.reduce((a, b) => (b.priceMinor < a.priceMinor ? b : a));
  const compareAt = cheapest.compareAtMinor && cheapest.compareAtMinor > cheapest.priceMinor ? cheapest.compareAtMinor : null;
  return {
    price: cheapest.priceMinor,
    compareAt,
    inStock: variants.some((v) => v.stock > 0),
    discountPct: compareAt ? Math.round((1 - cheapest.priceMinor / compareAt) * 100) : 0,
  };
}

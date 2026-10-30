import { describe, expect, it } from "vitest";
import { discountInputSchema, productInputSchema, shopOnboardingSchema, slugify } from "@/lib/validation/seller";

const variant = { attributes: { size: "M" }, sku: "tee-m", priceMinor: 8990, compareAtMinor: null, stock: 5, isActive: true };
const product = {
  title: "Organic tee",
  slug: "",
  categoryId: "c1",
  brandName: "",
  description: "A soft organic cotton tee.",
  specs: [{ key: "Material", value: "Cotton" }, { key: "", value: "" }],
  images: [{ url: "/uploads/a.jpg" }],
  variants: [variant, { ...variant, attributes: { size: "L" }, sku: "TEE-L" }],
  intent: "publish" as const,
};
const messages = (r: { success: boolean; error?: { issues: { message: string }[] } }) => r.error?.issues.map((i) => i.message) ?? [];

describe("productInputSchema", () => {
  it("accepts a valid product, upper-cases SKUs and drops empty spec rows", () => {
    const parsed = productInputSchema.parse(product);
    expect(parsed.variants[0].sku).toBe("TEE-M");
    expect(parsed.specs).toEqual([{ key: "Material", value: "Cotton" }]);
  });

  it("needs an image to publish, but not for a draft", () => {
    expect(messages(productInputSchema.safeParse({ ...product, images: [] }))).toContain("needImage");
    expect(productInputSchema.safeParse({ ...product, images: [], intent: "draft" }).success).toBe(true);
  });

  it("rejects duplicate SKUs, duplicate options and mismatched option names", () => {
    expect(messages(productInputSchema.safeParse({ ...product, variants: [variant, { ...variant, attributes: { size: "L" } }] }))).toContain("duplicateSku");
    expect(messages(productInputSchema.safeParse({ ...product, variants: [variant, { ...variant, sku: "X" }] }))).toContain("duplicateVariant");
    expect(messages(productInputSchema.safeParse({ ...product, variants: [variant, { ...variant, sku: "X", attributes: { color: "red" } }] }))).toContain(
      "variantOptionsMismatch",
    );
  });

  it("reports an empty variant list instead of crashing", () => {
    expect(messages(productInputSchema.safeParse({ ...product, variants: [] }))).toContain("needVariant");
  });

  it("requires the compare-at price to be higher than the price", () => {
    expect(messages(productInputSchema.safeParse({ ...product, variants: [{ ...variant, compareAtMinor: 8990 }] }))).toContain("compareAtTooLow");
  });
});

describe("shopOnboardingSchema", () => {
  const shop = {
    name: "My Shop",
    slug: "my-shop",
    description: "",
    contactEmail: "Me@Shop.co.il",
    contactPhone: "052-555-1234",
    legalName: "My Shop Ltd",
    taxId: "515000008",
    addressLine1: "Herzl 1",
    city: "Tel Aviv",
    postalCode: "6100000",
    bank: { holderName: "My Shop Ltd", bankCode: "12", branch: "600", account: "123456" },
    acceptTerms: true,
  };
  it("accepts a valid application", () => {
    expect(shopOnboardingSchema.parse(shop).contactEmail).toBe("me@shop.co.il");
  });
  it.each([
    [{ taxId: "515000001" }, "invalidTaxId"],
    [{ slug: "admin" }, "slugReserved"],
    [{ slug: "Bad Slug" }, "invalidSlug"],
    [{ bank: { ...shop.bank, branch: "6" } }, "invalidBranch"],
    [{ acceptTerms: false }, "mustAcceptTerms"],
  ])("rejects %j", (override, code) => {
    expect(messages(shopOnboardingSchema.safeParse({ ...shop, ...override }))).toContain(code);
  });
});

describe("discountInputSchema", () => {
  const base = { productId: null, type: "PERCENT" as const, value: 1500, startsAt: new Date("2026-11-01"), endsAt: new Date("2026-11-10") };
  it("validates ranges and dates", () => {
    expect(discountInputSchema.safeParse(base).success).toBe(true);
    expect(messages(discountInputSchema.safeParse({ ...base, value: 9500 }))).toContain("percentRange");
    expect(messages(discountInputSchema.safeParse({ ...base, endsAt: base.startsAt }))).toContain("endBeforeStart");
  });
});

describe("slugify", () => {
  it("makes ASCII slugs and returns empty for non-Latin titles", () => {
    expect(slugify("  Organic Cotton Tee – XL! ")).toBe("organic-cotton-tee-xl");
    expect(slugify("חולצת טי")).toBe("");
  });
});

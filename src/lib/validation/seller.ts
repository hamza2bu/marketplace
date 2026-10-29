import { z } from "zod";
import { isValidIsraeliId } from "@/lib/israeli-id";

const RESERVED_SLUGS = new Set(["admin", "seller", "sell", "api", "new", "settings", "account", "cart", "checkout", "search", "deals"]);

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { error: "invalidSlug" })
  .min(3, { error: "invalidSlug" })
  .max(60, { error: "invalidSlug" })
  .refine((s) => !RESERVED_SLUGS.has(s), { error: "slugReserved" });

/** ASCII slug from a title; Hebrew/Arabic titles yield "" (the caller then generates one). */
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}

const phone = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, ""))
  .pipe(z.string().regex(/^(?:\+972|0)(?:[23489]|5\d|7\d)\d{7}$/, { error: "invalidPhone" }));

const required = (max: number) => z.string().trim().min(1, { error: "required" }).max(max);

// ───────────────────────── Shop ─────────────────────────

export const bankAccountSchema = z.object({
  holderName: z.string().trim().min(2, { error: "nameTooShort" }).max(80),
  bankCode: z.string().trim().regex(/^\d{2}$/, { error: "invalidBankCode" }),
  branch: z.string().trim().regex(/^\d{3}$/, { error: "invalidBranch" }),
  account: z.string().trim().regex(/^\d{4,9}$/, { error: "invalidAccount" }),
});
export type BankAccount = z.infer<typeof bankAccountSchema>;

export const shopProfileSchema = z.object({
  name: z.string().trim().min(2, { error: "nameTooShort" }).max(60),
  description: z.string().trim().max(1000).optional().default(""),
  contactEmail: z.string().trim().toLowerCase().pipe(z.email({ error: "invalidEmail" })),
  contactPhone: phone,
});

export const shopOnboardingSchema = shopProfileSchema.extend({
  slug: slugSchema,
  legalName: required(120),
  taxId: z
    .string()
    .trim()
    .refine(isValidIsraeliId, { error: "invalidTaxId" }),
  addressLine1: required(120),
  city: required(60),
  postalCode: z.string().trim().regex(/^\d{7}$/, { error: "invalidPostalCode" }),
  bank: bankAccountSchema,
  acceptTerms: z.literal(true, { error: "mustAcceptTerms" }),
});
export type ShopOnboardingInput = z.infer<typeof shopOnboardingSchema>;

// ───────────────────────── Products ─────────────────────────

const attributeText = z.string().trim().min(1).max(40);

export const variantInputSchema = z.object({
  id: z.string().max(40).optional(),
  attributes: z.record(attributeText, attributeText).refine((a) => Object.keys(a).length <= 3, { error: "tooManyOptions" }),
  sku: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9_-]{0,63}$/, { error: "invalidSku" }),
  priceMinor: z.number().int().min(100, { error: "priceTooLow" }).max(100_000_000),
  compareAtMinor: z.number().int().max(100_000_000).nullable(),
  stock: z.number().int().min(0).max(100_000),
  isActive: z.boolean(),
});

export const productInputSchema = z
  .object({
    title: z.string().trim().min(3, { error: "titleTooShort" }).max(150),
    slug: z.union([slugSchema, z.literal("")]),
    categoryId: z.string().min(1, { error: "required" }).max(40),
    brandName: z.string().trim().max(60).optional().default(""),
    description: z.string().trim().min(10, { error: "descriptionTooShort" }).max(5000),
    specs: z
      .array(z.object({ key: z.string().trim().max(60), value: z.string().trim().max(200) }))
      .max(30)
      .transform((rows) => rows.filter((r) => r.key && r.value)),
    images: z.array(z.object({ url: z.string().max(500), alt: z.string().trim().max(150).optional().default("") })).max(10),
    variants: z.array(variantInputSchema).min(1, { error: "needVariant" }).max(100, { error: "tooManyVariants" }),
    intent: z.enum(["draft", "publish"]),
  })
  .superRefine((p, ctx) => {
    if (p.intent === "publish" && p.images.length === 0) ctx.addIssue({ code: "custom", path: ["images"], message: "needImage" });
    // The array's own min(1) reports an empty list; the checks below need at least one variant.
    if (p.variants.length === 0) return;

    const keys = (v: { attributes: Record<string, string> }) => Object.keys(v.attributes).sort().join("|");
    const first = keys(p.variants[0]);
    if (p.variants.some((v) => keys(v) !== first)) ctx.addIssue({ code: "custom", path: ["variants"], message: "variantOptionsMismatch" });

    const combos = p.variants.map((v) => JSON.stringify(Object.entries(v.attributes).sort()));
    if (new Set(combos).size !== combos.length) ctx.addIssue({ code: "custom", path: ["variants"], message: "duplicateVariant" });

    const skus = p.variants.map((v) => v.sku);
    if (new Set(skus).size !== skus.length) ctx.addIssue({ code: "custom", path: ["variants"], message: "duplicateSku" });

    p.variants.forEach((v, i) => {
      if (v.compareAtMinor !== null && v.compareAtMinor <= v.priceMinor) {
        ctx.addIssue({ code: "custom", path: ["variants", i, "compareAtMinor"], message: "compareAtTooLow" });
      }
    });
    if (p.intent === "publish" && !p.variants.some((v) => v.isActive)) {
      ctx.addIssue({ code: "custom", path: ["variants"], message: "needActiveVariant" });
    }
  });
export type ProductInput = z.infer<typeof productInputSchema>;

// ───────────────────────── Discounts ─────────────────────────

export const discountInputSchema = z
  .object({
    productId: z.string().max(40).nullable(),
    type: z.enum(["PERCENT", "FIXED"]),
    value: z.number().int().positive(),
    startsAt: z.date(),
    endsAt: z.date(),
  })
  .superRefine((d, ctx) => {
    if (d.type === "PERCENT" && (d.value < 100 || d.value > 9000)) ctx.addIssue({ code: "custom", path: ["value"], message: "percentRange" });
    if (d.type === "FIXED" && d.value < 100) ctx.addIssue({ code: "custom", path: ["value"], message: "priceTooLow" });
    if (d.endsAt <= d.startsAt) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "endBeforeStart" });
    if (d.endsAt.getTime() - d.startsAt.getTime() > 366 * 86_400_000) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "discountTooLong" });
  });

// ───────────────────────── Fulfilment ─────────────────────────

export const CARRIERS = ["israel-post", "hfd", "cheetah", "ups", "dhl", "fedex", "other"] as const;

export const shipmentSchema = z.object({
  carrier: z.enum(CARRIERS),
  trackingNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{4,40}$/, { error: "invalidTracking" }),
});

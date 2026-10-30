import { z } from "zod";
import { slugSchema } from "@/lib/validation/seller";

const name = z.string().trim().min(1, { error: "required" }).max(60);
const bps = (max: number) => z.number().int().min(0).max(max);

export const categoryInputSchema = z.object({
  slug: slugSchema,
  name: z.object({ he: name, ar: name, en: name }),
  parentId: z.string().max(40).nullable(),
  commissionBps: bps(5000).nullable(),
  sortOrder: z.number().int().min(0).max(1000),
  isActive: z.boolean(),
  imageUrl: z.string().max(500).nullable(),
});
export type CategoryInput = z.infer<typeof categoryInputSchema>;

const localized = (max: number) => z.object({ he: z.string().trim().max(max), ar: z.string().trim().max(max), en: z.string().trim().max(max) });

export const bannerInputSchema = z
  .object({
    title: localized(80).refine((t) => t.he || t.ar || t.en, { error: "required" }),
    subtitle: localized(160),
    imageUrl: z.string().min(1, { error: "needImage" }).max(500),
    // A path on this site ("/deals", "/c/kitchen"), never an outside link.
    linkUrl: z.string().trim().regex(/^\/[a-z0-9/_?=&-]*$/i, { error: "invalidLink" }).max(200),
    sortOrder: z.number().int().min(0).max(100),
    isActive: z.boolean(),
    startsAt: z.date().nullable(),
    endsAt: z.date().nullable(),
  })
  .refine((b) => !b.startsAt || !b.endsAt || b.endsAt > b.startsAt, { error: "endBeforeStart", path: ["endsAt"] });
export type BannerInput = z.infer<typeof bannerInputSchema>;

export const settingsInputSchema = z.object({
  globalCommissionBps: bps(5000),
  vatBps: bps(3000),
  shippingFlatMinor: z.number().int().min(0).max(100_000),
  freeShippingOverMinor: z.number().int().min(0).max(10_000_000),
  returnWindowDays: z.number().int().min(0).max(60),
  paymentWindowMinutes: z.number().int().min(10).max(180),
});
export type SettingsInput = z.infer<typeof settingsInputSchema>;

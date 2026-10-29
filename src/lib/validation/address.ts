import { z } from "zod";

const text = (max: number) => z.string().trim().min(1, { error: "required" }).max(max);

export const addressSchema = z.object({
  fullName: z.string().trim().min(2, { error: "nameTooShort" }).max(80),
  // Israeli mobile or landline, with or without +972 / dashes / spaces.
  phone: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s-]/g, ""))
    .pipe(z.string().regex(/^(?:\+972|0)(?:[23489]|5\d|7\d)\d{7}$/, { error: "invalidPhone" })),
  line1: text(120),
  line2: z.string().trim().max(120).optional().transform((v) => v || undefined),
  city: text(60),
  postalCode: z
    .string()
    .trim()
    .regex(/^\d{7}$/, { error: "invalidPostalCode" }),
  isDefault: z.boolean().default(false),
});

export type AddressInput = z.infer<typeof addressSchema>;

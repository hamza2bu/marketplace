import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "invalidEmail" }).max(254));

export const passwordSchema = z
  .string()
  .min(8, { error: "passwordTooShort" })
  .max(128, { error: "passwordTooLong" })
  .regex(/[A-Za-z]/, { error: "passwordNeedsLetter" })
  .regex(/[0-9]/, { error: "passwordNeedsNumber" });

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { error: "required" }).max(128),
});

export const signUpSchema = z.object({
  name: z.string().trim().min(2, { error: "nameTooShort" }).max(80),
  email: emailSchema,
  password: passwordSchema,
});

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;

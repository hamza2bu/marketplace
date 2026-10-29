"use server";

import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { db } from "@/server/db";
import { limitAuthAttempt } from "@/server/rate-limit";
import { signInSchema, signUpSchema } from "@/lib/validation/auth";
import { safeCallbackPath } from "@/lib/safe-redirect";
import { routing } from "@/i18n/routing";
import { hasLocale } from "next-intl";

export type AuthFormState = {
  error?: string;
  // Set on success; the form does a full page load there so the header's
  // client-side session refreshes.
  redirectTo?: string;
  fieldErrors?: Partial<Record<string, string>>;
  values?: { name?: string; email?: string };
};

function localeFrom(formData: FormData) {
  const locale = String(formData.get("locale") ?? "");
  return hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
}

function fieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0]);
    out[key] ??= issue.message;
  }
  return out;
}

async function signInWithCredentials(email: string, password: string, redirectTo: string) {
  try {
    await signIn("credentials", { email, password, redirect: false });
  } catch (error) {
    if (error instanceof AuthError) return { error: "invalidCredentials" };
    throw error;
  }
  return { redirectTo };
}

export async function signInAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const locale = localeFrom(formData);
  const email = String(formData.get("email") ?? "");
  const parsed = signInSchema.safeParse({ email, password: formData.get("password") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error.issues), values: { email } };

  if (!(await limitAuthAttempt("sign-in")).ok) return { error: "rateLimited", values: { email } };

  const redirectTo = safeCallbackPath(formData.get("callbackUrl"), `/${locale}/account`);
  const result = await signInWithCredentials(parsed.data.email, parsed.data.password, redirectTo);
  return { ...result, values: { email } };
}

export async function signUpAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const locale = localeFrom(formData);
  const values = { name: String(formData.get("name") ?? ""), email: String(formData.get("email") ?? "") };
  const parsed = signUpSchema.safeParse({ ...values, password: formData.get("password") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error.issues), values };

  if (!(await limitAuthAttempt("sign-up")).ok) return { error: "rateLimited", values };

  const { name, email, password } = parsed.data;
  const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) return { fieldErrors: { email: "emailTaken" }, values };

  await db.user.create({
    data: { name, email, passwordHash: await bcrypt.hash(password, 12), role: "CUSTOMER", locale },
  });

  const result = await signInWithCredentials(email, password, `/${locale}/account`);
  return { ...result, values };
}

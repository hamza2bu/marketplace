"use server";

import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { db } from "@/server/db";
import { mergeGuestCart } from "@/server/cart";
import { getCurrentUser } from "@/server/auth/guards";
import { issueToken, consumeToken } from "@/server/auth/tokens";
import { queueEmail } from "@/server/email";
import { emailSchema, passwordSchema } from "@/lib/validation/auth";
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
  // Keep what they put in the cart before signing in.
  const user = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (user) await mergeGuestCart(user.id);
  return { redirectTo };
}

/** Emails a link to confirm the address (sign-up, or "send again" from the account page). */
async function sendVerificationEmail(user: { id: string; email: string }) {
  const token = await issueToken("verify", user.email);
  const query = new URLSearchParams({ email: user.email, token });
  await queueEmail(db, { to: user.email, userId: user.id, template: "verify-email", payload: { path: `/verify-email?${query}` } });

}

export async function signInAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const locale = localeFrom(formData);
  const email = String(formData.get("email") ?? "");
  const parsed = signInSchema.safeParse({ email, password: formData.get("password") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error.issues), values: { email } };

  if (!(await limitAuthAttempt("sign-in")).ok) return { error: "rateLimited", values: { email } };

  const redirectTo = safeCallbackPath(formData.get("callbackUrl"), `/${locale}/account`);
  const result = await signInWithCredentials(parsed.data.email, parsed.data.password, redirectTo);
  // Emails go out in the language the person last signed in with.
  if (result.redirectTo) await db.user.update({ where: { email: parsed.data.email }, data: { locale } });
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

  const user = await db.user.create({
    data: { name, email, passwordHash: await bcrypt.hash(password, 12), role: "CUSTOMER", locale },
  });
  await sendVerificationEmail(user);

  const result = await signInWithCredentials(email, password, `/${locale}/account`);
  return { ...result, values };
}

export type ResetState = { sent?: boolean; done?: boolean; error?: string; fieldErrors?: Record<string, string> };

/** Always answers the same way, so it can't be used to find out who has an account. */
export async function requestPasswordResetAction(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return { fieldErrors: { email: "invalidEmail" } };
  if (!(await limitAuthAttempt("reset")).ok) return { error: "rateLimited" };
  const user = await db.user.findUnique({ where: { email: parsed.data }, select: { id: true, email: true, status: true, passwordHash: true } });
  if (user?.passwordHash && user.status === "ACTIVE") {
    const token = await issueToken("reset", user.email);
    const query = new URLSearchParams({ email: user.email, token });
    await queueEmail(db, { to: user.email, userId: user.id, template: "password-reset", payload: { path: `/reset-password?${query}` } });
  }
  return { sent: true };
}

export async function resetPasswordAction(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const email = emailSchema.safeParse(formData.get("email"));
  const password = passwordSchema.safeParse(formData.get("password"));
  if (!password.success) return { fieldErrors: { password: password.error.issues[0].message } };
  if (!email.success) return { error: "resetInvalid" };
  if (!(await limitAuthAttempt("reset")).ok) return { error: "rateLimited" };
  if (!(await consumeToken("reset", email.data, String(formData.get("token") ?? "")))) return { error: "resetInvalid" };
  await db.user.update({
    where: { email: email.data },
    // Changing the password signs out every existing session (see src/auth.ts).
    data: { passwordHash: await bcrypt.hash(password.data, 12), passwordChangedAt: new Date() },
  });
  return { done: true };
}

/** "Send the confirmation email again" on the account page. */
export async function resendVerificationAction(): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user || !(await limitAuthAttempt("verify")).ok) return { ok: false };
  const full = await db.user.findUnique({ where: { id: user.id }, select: { emailVerified: true } });
  if (full?.emailVerified) return { ok: true };
  await sendVerificationEmail(user);
  return { ok: true };
}

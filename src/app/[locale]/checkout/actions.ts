"use server";

import { revalidatePath } from "next/cache";
import { hasLocale } from "next-intl";
import { z } from "zod";
import { routing } from "@/i18n/routing";
import { requireUser } from "@/server/auth/guards";
import { db } from "@/server/db";
import { placeOrder, type PlaceOrderError } from "@/server/orders";
import { rateLimit } from "@/server/rate-limit";
import { addressSchema } from "@/lib/validation/address";

function localeOf(value: unknown) {
  return typeof value === "string" && hasLocale(routing.locales, value) ? value : routing.defaultLocale;
}

export type AddressFormState = { ok?: boolean; fieldErrors?: Record<string, string>; values?: Record<string, string> };

/** Saves a new address for the signed-in user (used by checkout and the account page). */
export async function saveAddressAction(_prev: AddressFormState, formData: FormData): Promise<AddressFormState> {
  const locale = localeOf(formData.get("locale"));
  const user = await requireUser(locale);
  const raw = Object.fromEntries(
    ["fullName", "phone", "line1", "line2", "city", "postalCode"].map((k) => [k, String(formData.get(k) ?? "")]),
  );
  const parsed = addressSchema.safeParse({ ...raw, isDefault: formData.get("isDefault") === "on" });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { fieldErrors, values: raw };
  }
  if (!(await rateLimit("account", "address", user.id)).ok) return { fieldErrors: { fullName: "rateLimited" }, values: raw };

  const count = await db.address.count({ where: { userId: user.id } });
  if (count >= 20) return { fieldErrors: { fullName: "generic" }, values: raw };
  const isDefault = parsed.data.isDefault || count === 0;
  await db.$transaction(async (tx) => {
    if (isDefault) await tx.address.updateMany({ where: { userId: user.id }, data: { isDefault: false } });
    await tx.address.create({ data: { ...parsed.data, isDefault, userId: user.id } });
  });
  revalidatePath(`/${locale}/checkout`);
  revalidatePath(`/${locale}/account/addresses`);
  return { ok: true };
}

export async function deleteAddressAction(formData: FormData): Promise<void> {
  const locale = localeOf(formData.get("locale"));
  const user = await requireUser(locale);
  await db.address.deleteMany({ where: { id: String(formData.get("addressId") ?? ""), userId: user.id } });
  revalidatePath(`/${locale}/account/addresses`);
}

const placeSchema = z.object({
  addressId: z.string().min(1).max(40),
  checkoutToken: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
});

export type PlaceOrderState = { error?: PlaceOrderError | "rate_limited"; redirectUrl?: string; orderNumber?: string };

export async function placeOrderAction(_prev: PlaceOrderState, formData: FormData): Promise<PlaceOrderState> {
  const locale = localeOf(formData.get("locale"));
  const user = await requireUser(locale, `/${locale}/checkout`);
  const parsed = placeSchema.safeParse({ addressId: formData.get("addressId"), checkoutToken: formData.get("checkoutToken") });
  if (!parsed.success) return { error: "address_not_found" };
  if (!(await rateLimit("checkout", "place", user.id)).ok) return { error: "rate_limited" };

  const result = await placeOrder(user, { ...parsed.data, locale });
  if (!result.ok) return { error: result.error, orderNumber: result.orderNumber };
  return { redirectUrl: result.redirectUrl, orderNumber: result.orderNumber };
}

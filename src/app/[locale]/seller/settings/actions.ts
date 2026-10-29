"use server";

import { refresh, revalidatePath } from "next/cache";
import { routing } from "@/i18n/routing";
import { isAllowedImageUrl } from "@/lib/images";
import { bankAccountSchema, shopProfileSchema } from "@/lib/validation/seller";
import { encryptJson } from "@/server/crypto";
import { db } from "@/server/db";
import { sellerAction } from "@/server/seller/context";
import { cloudinaryConfig } from "@/server/storage";

export type SettingsState = { ok?: boolean; error?: string; fieldErrors?: Record<string, string>; values?: Record<string, string> };

const imageOrNull = (value: FormDataEntryValue | null) => {
  const url = String(value ?? "").trim();
  return url && isAllowedImageUrl(url, cloudinaryConfig()?.cloud) ? url : null;
};

export async function saveShopProfileAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const { shop, user, limited } = await sellerAction(formData.get("locale"));
  if (limited) return { error: "rateLimited" };
  const values = Object.fromEntries(["name", "description", "contactEmail", "contactPhone", "logoUrl", "bannerUrl"].map((f) => [f, String(formData.get(f) ?? "")]));
  const parsed = shopProfileSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    contactEmail: formData.get("contactEmail"),
    contactPhone: formData.get("contactPhone"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { fieldErrors, values };
  }
  await db.shop.update({
    where: { id: shop.id },
    data: { ...parsed.data, description: parsed.data.description || null, logoUrl: imageOrNull(formData.get("logoUrl")), bannerUrl: imageOrNull(formData.get("bannerUrl")) },
  });
  await db.auditLog.create({ data: { actorId: user.id, action: "shop.profile_updated", entity: "Shop", entityId: shop.id } });
  for (const locale of routing.locales) revalidatePath(`/${locale}/s/${shop.slug}`);
  refresh();
  return { ok: true };
}

export async function saveBankAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const { shop, user, limited } = await sellerAction(formData.get("locale"));
  if (limited) return { error: "rateLimited" };
  const values = Object.fromEntries(["holderName", "bankCode", "branch", "account"].map((f) => [f, String(formData.get(f) ?? "")]));
  const parsed = bankAccountSchema.safeParse({
    holderName: formData.get("holderName"),
    bankCode: formData.get("bankCode"),
    branch: formData.get("branch"),
    account: formData.get("account"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { fieldErrors, values };
  }
  await db.shop.update({
    where: { id: shop.id },
    data: { payoutBankEncrypted: encryptJson(parsed.data), payoutBankLast4: parsed.data.account.slice(-4) },
  });
  // Bank changes are sensitive: always leave a trail.
  await db.auditLog.create({ data: { actorId: user.id, action: "shop.bank_updated", entity: "Shop", entityId: shop.id, meta: { last4: parsed.data.account.slice(-4) } } });
  refresh();
  return { ok: true };
}

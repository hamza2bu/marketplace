"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/components/admin/action-form";
import { parseLocalDateTime } from "@/lib/dates";
import { formatMoney, parseMoney } from "@/lib/money";
import { bannerInputSchema, categoryInputSchema, settingsInputSchema } from "@/lib/validation/admin";
import { deleteBanner, deleteCategory, moderateProduct, moderateReview, saveBanner, saveCategory, updateSettings } from "@/server/admin/catalog";
import { adminAction } from "@/server/admin/context";
import { addDisputeMessage, adminRefund, resolveDispute } from "@/server/admin/orders";
import { recordPayout } from "@/server/admin/payouts";
import { revealBankAccount, setShopCommission, setShopStatus } from "@/server/admin/shops";
import { setUserStatus } from "@/server/admin/users";

const id = (formData: FormData, key: string) => String(formData.get(key) ?? "").slice(0, 40);
const text = (min: number, max: number) => z.string().trim().min(min).max(max);

/** Percent typed by a person ("12.5") → basis points; "" → null. */
function percentToBps(value: FormDataEntryValue | null): number | null | undefined {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 100) : undefined;
}

function done<T extends ActionState>(result: T): T {
  if (result.ok) refresh();
  return result;
}

// ───────────────────────── Shops ─────────────────────────

export async function shopStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { admin, limited } = await adminAction(formData.get("locale"));
  if (limited) return { error: "rateLimited" };
  const to = z.enum(["APPROVED", "SUSPENDED", "REMOVED"]).safeParse(formData.get("to"));
  if (!to.success) return { error: "not_allowed" };
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 300);
  return done(await setShopStatus(admin.id, id(formData, "shopId"), to.data, reason));
}

export async function shopCommissionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { admin, limited } = await adminAction(formData.get("locale"));
  if (limited) return { error: "rateLimited" };
  const bps = percentToBps(formData.get("percent"));
  if (bps === undefined || (bps !== null && bps > 5000)) return { error: "invalid" };
  return done(await setShopCommission(admin.id, id(formData, "shopId"), bps));
}

export async function revealBankAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { admin, limited } = await adminAction(formData.get("locale"));
  if (limited) return { error: "rateLimited" };
  const bank = await revealBankAccount(admin.id, id(formData, "shopId"));
  if (!bank) return { error: "not_found" };
  return { ok: true, message: `${bank.bankCode}-${bank.branch}-${bank.account} · ${bank.holderName}` };
}

// ───────────────────────── Products & reviews ─────────────────────────

export async function moderateProductAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { admin, limited } = await adminAction(formData.get("locale"));
  if (limited) return { error: "rateLimited" };
  const action = String(formData.get("decision"));
  const productId = id(formData, "productId");
  if (action === "reject") {
    const note = text(3, 500).safeParse(formData.get("note"));
    if (!note.success) return { error: "invalid" };
    return done(await moderateProduct(admin.id, productId, { action: "reject", note: note.data }));
  }
  if (action !== "approve" && action !== "feature" && action !== "unfeature") return { error: "not_allowed" };
  const result = await moderateProduct(admin.id, productId, { action });
  return done(result.ok ? result : { error: "not_allowed" });
}

export async function moderateReviewAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { admin, limited } = await adminAction(formData.get("locale"));
  if (limited) return { error: "rateLimited" };
  const action = z.enum(["show", "hide", "delete"]).safeParse(formData.get("decision"));
  if (!action.success) return { error: "not_allowed" };
  return done(await moderateReview(admin.id, id(formData, "reviewId"), action.data));
}

// ───────────────────────── Users ─────────────────────────

export async function userStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { admin, limited } = await adminAction(formData.get("locale"));
  if (limited) return { error: "rateLimited" };
  const status = z.enum(["ACTIVE", "SUSPENDED"]).safeParse(formData.get("status"));
  if (!status.success) return { error: "not_allowed" };
  const result = await setUserStatus(admin.id, id(formData, "userId"), status.data);
  return done(result.ok ? result : { error: "not_allowed" });
}

// ───────────────────────── Orders, disputes, payouts ─────────────────────────

export async function refundAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { admin, limited } = await adminAction(formData.get("locale"));
  if (limited) return { error: "rateLimited" };
  const reason = text(3, 300).safeParse(formData.get("reason"));
  if (!reason.success) return { error: "invalid" };
  const raw = String(formData.get("amount") ?? "").trim();
  const amountMinor = raw ? parseMoney(raw) : undefined;
  if (amountMinor === null || amountMinor === 0) return { error: "invalid_amount" };
  return done(
    await adminRefund(admin.id, {
      subOrderId: id(formData, "subOrderId"),
      amountMinor,
      reason: reason.data,
      restock: formData.get("restock") === "on",
      cancel: formData.get("cancel") === "on",
    }),
  );
}

export async function disputeMessageAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { admin, limited } = await adminAction(formData.get("locale"));
  if (limited) return { error: "rateLimited" };
  const message = text(2, 1000).safeParse(formData.get("message"));
  if (!message.success) return { error: "invalid" };
  const result = await addDisputeMessage(id(formData, "disputeId"), "admin", message.data, admin.id);
  return done(result.ok ? result : { error: "not_allowed" });
}

export async function resolveDisputeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { admin, limited } = await adminAction(formData.get("locale"));
  if (limited) return { error: "rateLimited" };
  const resolution = text(3, 1000).safeParse(formData.get("resolution"));
  if (!resolution.success) return { error: "invalid" };
  const raw = String(formData.get("amount") ?? "").trim();
  const refundMinor = raw ? parseMoney(raw) : undefined;
  if (refundMinor === null || refundMinor === 0) return { error: "invalid_amount" };
  return done(await resolveDispute(admin.id, id(formData, "disputeId"), { resolution: resolution.data, refundMinor, restock: formData.get("restock") === "on" }));
}

export async function payoutAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { locale, admin, limited } = await adminAction(formData.get("locale"));
  if (limited) return { error: "rateLimited" };
  const reference = z.string().trim().regex(/^[\w\-./ ]{3,60}$/).safeParse(formData.get("reference"));
  if (!reference.success) return { error: "invalid" };
  const result = await recordPayout(admin.id, id(formData, "shopId"), reference.data);
  if (!result.ok) return { error: result.error };
  refresh();
  return { ok: true, message: `✓ ${formatMoney(result.amountMinor, locale)}` };
}

// ───────────────────────── Categories, banners, settings ─────────────────────────

export async function saveCategoryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { admin, limited } = await adminAction(formData.get("locale"));
  if (limited) return { error: "rateLimited" };
  const commission = percentToBps(formData.get("commission"));
  const parsed = categoryInputSchema.safeParse({
    slug: formData.get("slug"),
    name: { he: formData.get("nameHe"), ar: formData.get("nameAr"), en: formData.get("nameEn") },
    parentId: id(formData, "parentId") || null,
    commissionBps: commission === undefined ? -1 : commission,
    sortOrder: Number(formData.get("sortOrder") || 0),
    isActive: formData.get("isActive") === "on",
    imageUrl: String(formData.get("imageUrl") ?? "") || null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message === "invalidSlug" || parsed.error.issues[0].message === "slugReserved" ? "slug_taken" : "invalid" };
  const result = await saveCategory(admin.id, parsed.data, id(formData, "categoryId") || undefined);
  return done(result.ok ? { ok: true } : { error: result.error });
}

export async function deleteCategoryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { admin, limited } = await adminAction(formData.get("locale"));
  if (limited) return { error: "rateLimited" };
  return done(await deleteCategory(admin.id, id(formData, "categoryId")));
}

export async function saveBannerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { admin, limited } = await adminAction(formData.get("locale"));
  if (limited) return { error: "rateLimited" };
  const date = (key: string) => {
    const raw = String(formData.get(key) ?? "").trim();
    return raw ? parseLocalDateTime(raw) : null;
  };
  const parsed = bannerInputSchema.safeParse({
    title: { he: formData.get("titleHe") ?? "", ar: formData.get("titleAr") ?? "", en: formData.get("titleEn") ?? "" },
    subtitle: { he: formData.get("subtitleHe") ?? "", ar: formData.get("subtitleAr") ?? "", en: formData.get("subtitleEn") ?? "" },
    imageUrl: formData.get("imageUrl") ?? "",
    linkUrl: formData.get("linkUrl") ?? "",
    sortOrder: Number(formData.get("sortOrder") || 0),
    isActive: formData.get("isActive") === "on",
    startsAt: date("startsAt"),
    endsAt: date("endsAt"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const result = await saveBanner(admin.id, parsed.data, id(formData, "bannerId") || undefined);
  return done(result.ok ? { ok: true } : { error: result.error });
}

export async function deleteBannerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { admin, limited } = await adminAction(formData.get("locale"));
  if (limited) return { error: "rateLimited" };
  await deleteBanner(admin.id, id(formData, "bannerId"));
  return done({ ok: true });
}

export async function settingsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { admin, limited } = await adminAction(formData.get("locale"));
  if (limited) return { error: "rateLimited" };
  const parsed = settingsInputSchema.safeParse({
    globalCommissionBps: percentToBps(formData.get("globalCommission")) ?? -1,
    vatBps: percentToBps(formData.get("vat")) ?? -1,
    shippingFlatMinor: parseMoney(String(formData.get("shippingFlat") ?? "")) ?? -1,
    freeShippingOverMinor: parseMoney(String(formData.get("freeShippingOver") ?? "")) ?? -1,
    returnWindowDays: Number(formData.get("returnWindow")),
    paymentWindowMinutes: Number(formData.get("paymentWindow")),
  });
  if (!parsed.success) return { error: "invalid" };
  await updateSettings(admin.id, parsed.data);
  return done({ ok: true });
}

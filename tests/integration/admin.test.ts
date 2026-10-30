import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), refresh: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("@/server/auth/guards", () => ({}));
vi.mock("@/server/cart", () => ({}));

import { db } from "@/server/db";
import { setShopStatus, setShopCommission, revealBankAccount } from "@/server/admin/shops";
import { moderateProduct, saveCategory, deleteCategory, updateSettings, moderateReview } from "@/server/admin/catalog";
import { adminRefund, openDispute, addDisputeMessage, resolveDispute } from "@/server/admin/orders";
import { payableShops, recordPayout } from "@/server/admin/payouts";
import { platformSummary } from "@/server/admin/reports";
import { setUserStatus } from "@/server/admin/users";
import { releaseDueFunds } from "@/server/payments/service";
import { advanceSubOrder } from "@/server/seller/orders";
import { balances } from "@/server/seller/analytics";
import { fixtureScope } from "../support/fixtures";

const TAG = `ad${Date.now()}`;
const fx = fixtureScope(TAG);
let admin: { id: string };
let customer: { id: string };

beforeAll(async () => {
  admin = await fx.user("admin", "ADMIN");
  customer = await fx.user("buyer");
});
afterAll(async () => {
  await db.category.deleteMany({ where: { slug: { startsWith: TAG } } });
  await fx.cleanup();
  await db.$disconnect();
});

const visibleCount = (shopId: string) => db.product.count({ where: { shopId, status: "ACTIVE", shop: { status: "APPROVED" } } });

describe("shops", () => {
  it("approve → suspend → reactivate, with audit trail; invalid moves refused", async () => {
    const shop = await fx.shop("lifecycle", "PENDING");
    await fx.product(shop.id, "a");
    expect(await visibleCount(shop.id)).toBe(0);

    expect(await setShopStatus(admin.id, shop.id, "APPROVED", "")).toEqual({ ok: true });
    expect(await visibleCount(shop.id)).toBe(1);
    expect(await setShopStatus(admin.id, shop.id, "APPROVED", "")).toEqual({ ok: false, error: "not_allowed" });

    expect(await setShopStatus(admin.id, shop.id, "SUSPENDED", "Late shipments")).toEqual({ ok: true });
    expect(await visibleCount(shop.id)).toBe(0);
    expect((await db.shop.findUniqueOrThrow({ where: { id: shop.id } })).statusReason).toBe("Late shipments");
    expect(await setShopStatus(admin.id, shop.id, "APPROVED", "")).toEqual({ ok: true });

    const actions = (await db.auditLog.findMany({ where: { entityId: shop.id }, orderBy: { createdAt: "asc" } })).map((a) => a.action);
    expect(actions).toEqual(["shop.approved", "shop.suspended", "shop.approved"]);
  });

  it("won't remove a shop with open orders", async () => {
    const shop = await fx.shop("busy");
    const product = await fx.product(shop.id, "b");
    await fx.paidOrder(customer.id, product.variants[0].id);
    expect(await setShopStatus(admin.id, shop.id, "REMOVED", "")).toEqual({ ok: false, error: "open_orders" });
  });

  it("commission override changes the rate; bank details reveal is logged", async () => {
    const shop = await fx.shop("rates");
    await setShopCommission(admin.id, shop.id, 500);
    expect((await db.shop.findUniqueOrThrow({ where: { id: shop.id } })).commissionBpsOverride).toBe(500);
    expect(await revealBankAccount(admin.id, shop.id)).toMatchObject({ bankCode: "12", branch: "600", account: "1234567" });
    expect(await db.auditLog.count({ where: { entityId: shop.id, action: "shop.bank_viewed" } })).toBe(1);
  });
});

describe("moderation", () => {
  it("rejecting hides a product and notes why; approving restores it", async () => {
    const shop = await fx.shop("mod");
    const product = await fx.product(shop.id, "m");
    expect((await moderateProduct(admin.id, product.id, { action: "reject", note: "Counterfeit brand" })).ok).toBe(true);
    expect(await db.product.findUniqueOrThrow({ where: { id: product.id } })).toMatchObject({ status: "REJECTED", moderationNote: "Counterfeit brand" });
    expect((await moderateProduct(admin.id, product.id, { action: "feature" })).ok).toBe(false);
    expect((await moderateProduct(admin.id, product.id, { action: "approve" })).ok).toBe(true);
    expect((await db.product.findUniqueOrThrow({ where: { id: product.id } })).status).toBe("ACTIVE");
  });

  it("hiding a review updates the product rating", async () => {
    const shop = await fx.shop("rev");
    const product = await fx.product(shop.id, "r");
    const { sub } = await fx.paidOrder(customer.id, product.variants[0].id);
    const item = await db.orderItem.findFirstOrThrow({ where: { subOrderId: sub.id } });
    const review = await db.review.create({ data: { productId: product.id, userId: customer.id, orderItemId: item.id, rating: 2, body: "Meh" } });
    await moderateReview(admin.id, review.id, "show");
    expect((await db.product.findUniqueOrThrow({ where: { id: product.id } })).ratingCount).toBe(1);
    await moderateReview(admin.id, review.id, "hide");
    expect(await db.product.findUniqueOrThrow({ where: { id: product.id } })).toMatchObject({ ratingCount: 0, ratingAvg: 0 });
  });
});

describe("categories and settings", () => {
  const input = (slug: string, parentId: string | null = null) => ({
    slug, name: { he: "בדיקה", ar: "اختبار", en: "Test" }, parentId, commissionBps: 700, sortOrder: 50, isActive: true, imageUrl: null,
  });

  it("creates two levels, refuses a third and parents that hold products", async () => {
    const top = await saveCategory(admin.id, input(`${TAG}-top`));
    expect(top.ok).toBe(true);
    if (!top.ok) return;
    const leaf = await saveCategory(admin.id, input(`${TAG}-leaf`, top.id));
    expect(leaf.ok).toBe(true);
    if (!leaf.ok) return;
    expect(await saveCategory(admin.id, input(`${TAG}-deep`, leaf.id))).toEqual({ ok: false, error: "bad_parent" });
    const kitchen = await db.category.findUniqueOrThrow({ where: { slug: "kitchen" } });
    expect(await saveCategory(admin.id, input(`${TAG}-under-kitchen`, kitchen.id))).toEqual({ ok: false, error: "bad_parent" });
    expect(await saveCategory(admin.id, input(`${TAG}-top`))).toEqual({ ok: false, error: "slug_taken" });
    expect(await deleteCategory(admin.id, top.id)).toEqual({ ok: false, error: "has_children" });
    expect(await deleteCategory(admin.id, leaf.id)).toEqual({ ok: true });
  });

  it("settings changes record what changed", async () => {
    const before = await db.platformSettings.findUniqueOrThrow({ where: { id: 1 } });
    const current = {
      globalCommissionBps: before.globalCommissionBps,
      vatBps: before.vatBps,
      shippingFlatMinor: before.shippingFlatMinor,
      freeShippingOverMinor: before.freeShippingOverMinor,
      returnWindowDays: before.returnWindowDays,
      paymentWindowMinutes: before.paymentWindowMinutes,
    };
    await updateSettings(admin.id, { ...current, shippingFlatMinor: 3490 });
    const entry = await db.auditLog.findFirstOrThrow({ where: { actorId: admin.id, action: "settings.update" } });
    expect(entry.meta).toEqual({ shippingFlatMinor: { from: before.shippingFlatMinor, to: 3490 } });
    await updateSettings(admin.id, current);
  });
});

describe("orders, disputes and payouts", () => {
  it("admin partial refund books the ledger", async () => {
    const shop = await fx.shop("refund");
    const product = await fx.product(shop.id, "x");
    const { sub } = await fx.paidOrder(customer.id, product.variants[0].id);
    expect(await adminRefund(admin.id, { subOrderId: sub.id, amountMinor: 2500, reason: "Damaged", restock: false, cancel: false })).toEqual({ ok: true });
    expect(await adminRefund(admin.id, { subOrderId: sub.id, amountMinor: 1_000_000, reason: "Too much", restock: false, cancel: false })).toEqual({ ok: false, error: "invalid_amount" });
  });

  it("dispute: open once, discuss, resolve with a refund", async () => {
    const shop = await fx.shop("dispute");
    const product = await fx.product(shop.id, "d");
    const { sub } = await fx.paidOrder(customer.id, product.variants[0].id);
    expect((await openDispute(customer.id, sub.id, "Never arrived")).ok).toBe(true);
    expect(await openDispute(customer.id, sub.id, "Again")).toEqual({ ok: false, error: "not_allowed" });
    const dispute = await db.dispute.findFirstOrThrow({ where: { subOrderId: sub.id } });
    await addDisputeMessage(dispute.id, "admin", "Seller, please share tracking.", admin.id);
    expect((await db.dispute.findUniqueOrThrow({ where: { id: dispute.id } })).status).toBe("UNDER_REVIEW");
    expect(await resolveDispute(admin.id, dispute.id, { resolution: "Refunded in full", refundMinor: sub.subtotalMinor + sub.shippingMinor, restock: false })).toEqual({ ok: true });
    const after = await db.dispute.findUniqueOrThrow({ where: { id: dispute.id } });
    expect(after.status).toBe("RESOLVED");
    expect((after.messages as unknown[]).length).toBe(3);
    expect((await db.subOrder.findUniqueOrThrow({ where: { id: sub.id } })).status).toBe("REFUNDED");
  });

  it("payout pays the released balance once and marks it sent", async () => {
    const shop = await fx.shop("payout");
    const product = await fx.product(shop.id, "p");
    const { sub } = await fx.paidOrder(customer.id, product.variants[0].id);
    await advanceSubOrder(shop.id, sub.id, "PROCESSING", shop.ownerId);
    await advanceSubOrder(shop.id, sub.id, "SHIPPED", shop.ownerId, { carrier: "hfd", trackingNumber: "HFD-1234" });
    await advanceSubOrder(shop.id, sub.id, "DELIVERED", shop.ownerId);
    expect(await recordPayout(admin.id, shop.id, "REF-1")).toEqual({ ok: false, error: "nothing_to_pay" });

    await db.subOrder.update({ where: { id: sub.id }, data: { releaseAt: new Date(Date.now() - 1000) } });
    await releaseDueFunds();
    expect((await payableShops()).find((s) => s.id === shop.id)?.availableMinor).toBe(sub.sellerNetMinor);

    expect(await recordPayout(admin.id, shop.id, "BANK-REF-77")).toEqual({ ok: true, amountMinor: sub.sellerNetMinor });
    expect(await recordPayout(admin.id, shop.id, "BANK-REF-78")).toEqual({ ok: false, error: "nothing_to_pay" });
    expect(await balances(shop.id)).toEqual({ heldMinor: 0, availableMinor: 0, paidOutMinor: sub.sellerNetMinor });
    expect((await db.subOrder.findUniqueOrThrow({ where: { id: sub.id } })).transferStatus).toBe("SENT");
  });

  it("reports count paid orders and net commission", async () => {
    const summary = await platformSummary(7);
    expect(summary.orders).toBeGreaterThan(0);
    expect(summary.commissionMinor).toBeGreaterThanOrEqual(0);
    expect(summary.averageOrderMinor).toBe(Math.round(summary.gmvMinor / summary.orders));
  });
});

describe("users", () => {
  it("suspends customers but never admins or yourself", async () => {
    const victim = await fx.user("victim");
    expect((await setUserStatus(admin.id, victim.id, "SUSPENDED")).ok).toBe(true);
    expect((await db.user.findUniqueOrThrow({ where: { id: victim.id } })).status).toBe("SUSPENDED");
    expect((await setUserStatus(admin.id, admin.id, "SUSPENDED")).ok).toBe(false);
    const otherAdmin = await fx.user("admin2", "ADMIN");
    expect((await setUserStatus(admin.id, otherAdmin.id, "SUSPENDED")).ok).toBe(false);
  });
});

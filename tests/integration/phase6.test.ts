import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), refresh: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("@/server/auth/guards", () => ({}));
vi.mock("@/server/cart", () => ({}));

import { db } from "@/server/db";
import { consumeToken, issueToken } from "@/server/auth/tokens";
import { queueEmail, sendQueuedEmails } from "@/server/email";
import { deleteOwnReview, flagReview, replyToReview, saveReview } from "@/server/reviews";
import { advanceSubOrder } from "@/server/seller/orders";
import { toggleSaved } from "@/server/wishlist";
import { fixtureScope } from "../support/fixtures";

const TAG = `p6${Date.now()}`;
const fx = fixtureScope(TAG);

afterAll(async () => {
  await db.verificationToken.deleteMany({ where: { identifier: { contains: TAG } } });
  await db.wishlistItem.deleteMany({ where: { user: { email: { startsWith: TAG } } } });
  await fx.cleanup();
  await db.$disconnect();
});

describe("reviews", () => {
  let buyer: { id: string };
  let other: { id: string };
  let shop: Awaited<ReturnType<typeof fx.shop>>;
  let itemId: string;
  let productId: string;

  beforeAll(async () => {
    buyer = await fx.user("buyer");
    other = await fx.user("other");
    shop = await fx.shop("rev");
    const product = await fx.product(shop.id, "r");
    productId = product.id;
    const { sub } = await fx.paidOrder(buyer.id, product.variants[0].id);
    itemId = (await db.orderItem.findFirstOrThrow({ where: { subOrderId: sub.id } })).id;
    // Not delivered yet: no review.
    expect(await saveReview(buyer.id, itemId, { rating: 5, body: "Great stuff, really." })).toEqual({ ok: false, error: "not_allowed" });
    await advanceSubOrder(shop.id, sub.id, "PROCESSING", shop.ownerId);
    await advanceSubOrder(shop.id, sub.id, "SHIPPED", shop.ownerId, { carrier: "hfd", trackingNumber: "HFD-9999" });
    await advanceSubOrder(shop.id, sub.id, "DELIVERED", shop.ownerId);
  });

  it("verified buyer can review once delivered; editing updates the rating", async () => {
    expect(await saveReview(other.id, itemId, { rating: 1, body: "Not my order at all." })).toEqual({ ok: false, error: "not_found" });
    expect(await saveReview(buyer.id, itemId, { rating: 4, title: "Nice", body: "Works as described." })).toEqual({ ok: true });
    expect(await db.product.findUniqueOrThrow({ where: { id: productId } })).toMatchObject({ ratingAvg: 4, ratingCount: 1 });
    expect(await saveReview(buyer.id, itemId, { rating: 2, body: "Broke after a week." })).toEqual({ ok: true });
    expect(await db.review.count({ where: { orderItemId: itemId } })).toBe(1);
    expect((await db.product.findUniqueOrThrow({ where: { id: productId } })).ratingAvg).toBe(2);
    expect((await db.shop.findUniqueOrThrow({ where: { id: shop.id } })).ratingCount).toBe(1);
  });

  it("reports keep the review visible for the admin to decide; you can't report your own", async () => {
    const review = await db.review.findUniqueOrThrow({ where: { orderItemId: itemId } });
    expect(await flagReview(buyer.id, review.id, "spam")).toEqual({ ok: false, error: "own" });
    expect(await flagReview(other.id, review.id, "Offensive language")).toEqual({ ok: true });
    expect(await db.review.findUniqueOrThrow({ where: { id: review.id } })).toMatchObject({ status: "VISIBLE", flagReason: "Offensive language" });
  });

  it("only the product's shop can reply; the author can delete", async () => {
    const review = await db.review.findUniqueOrThrow({ where: { orderItemId: itemId } });
    const otherShop = await db.shop.findFirstOrThrow({ where: { slug: "techzone" } });
    expect((await replyToReview(otherShop.id, review.id, "Hi")).ok).toBe(false);
    expect((await replyToReview(shop.id, review.id, "Sorry! We'll replace it.")).ok).toBe(true);
    expect((await deleteOwnReview(other.id, review.id)).ok).toBe(false);
    expect((await deleteOwnReview(buyer.id, review.id)).ok).toBe(true);
    expect(await db.product.findUniqueOrThrow({ where: { id: productId } })).toMatchObject({ ratingAvg: 0, ratingCount: 0 });
  });
});

describe("wishlist", () => {
  it("toggles a live product on and off", async () => {
    const user = await fx.user("saver");
    const product = await db.product.findFirstOrThrow({ where: { status: "ACTIVE" } });
    expect(await toggleSaved(user.id, product.id)).toBe(true);
    expect(await toggleSaved(user.id, product.id)).toBe(false);
    expect(await toggleSaved(user.id, "nope")).toBeNull();
  });
});

describe("one-time tokens", () => {
  const email = `${TAG}-token@example.com`;
  it("work once, only with the right token, and only the latest one", async () => {
    const first = await issueToken("reset", email);
    const second = await issueToken("reset", email);
    expect(await consumeToken("reset", email, first)).toBe(false);
    expect(await consumeToken("verify", email, second)).toBe(false);
    expect(await consumeToken("reset", email, second)).toBe(true);
    expect(await consumeToken("reset", email, second)).toBe(false);
  });

  it("expire", async () => {
    const token = await issueToken("reset", email);
    await db.verificationToken.updateMany({ where: { identifier: `reset:${email}` }, data: { expires: new Date(Date.now() - 1000) } });
    expect(await consumeToken("reset", email, token)).toBe(false);
  });

  it("are stored hashed", async () => {
    const token = await issueToken("verify", email);
    const row = await db.verificationToken.findFirstOrThrow({ where: { identifier: `verify:${email}` } });
    expect(row.token).not.toBe(token);
    expect(row.token).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("email queue", () => {
  it("sends queued emails once, wipes one-time links, and records failures", async () => {
    const user = await fx.user("mail");
    await queueEmail(db, { to: user.email, userId: user.id, template: "password-reset", payload: { path: "/reset-password?token=secret" } });
    await queueEmail(db, { to: user.email, userId: user.id, template: "no-such-template", payload: {} });
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await sendQueuedEmails(500);
    info.mockRestore();

    const rows = await db.emailLog.findMany({ where: { userId: user.id }, orderBy: { template: "asc" } });
    expect(rows.map((r) => [r.template, r.status, r.attempts])).toEqual([
      ["no-such-template", "failed", 1],
      ["password-reset", "logged", 1],
    ]);
    expect(rows[1].payload).toEqual({ redacted: true });
    expect(rows[1].sentAt).not.toBeNull();

    // A second run doesn't resend what was sent.
    await sendQueuedEmails(500);
    expect((await db.emailLog.findFirstOrThrow({ where: { userId: user.id, template: "password-reset" } })).attempts).toBe(1);
  });
});

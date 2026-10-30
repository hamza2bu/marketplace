"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/server/auth/guards";
import { rateLimit } from "@/server/rate-limit";
import { deleteOwnReview, flagReview, saveReview } from "@/server/reviews";
import { toggleSaved } from "@/server/wishlist";

export type ReviewState = { ok?: boolean; error?: string };

const reviewSchema = z.object({
  orderItemId: z.string().min(1).max(40),
  rating: z.coerce.number().int().min(1).max(5),
  title: z.string().trim().max(120).optional(),
  body: z.string().trim().min(10).max(3000),
});

async function signedIn(kind: string) {
  const user = await getCurrentUser();
  if (!user) return null;
  if (!(await rateLimit("account", kind, user.id)).ok) return "limited" as const;
  return user;
}

export async function saveReviewAction(_prev: ReviewState, formData: FormData): Promise<ReviewState> {
  const user = await signedIn("review");
  if (!user) return { error: "not_allowed" };
  if (user === "limited") return { error: "rateLimited" };
  const parsed = reviewSchema.safeParse({
    orderItemId: formData.get("orderItemId"),
    rating: formData.get("rating"),
    title: formData.get("title") ?? undefined,
    body: formData.get("body"),
  });
  if (!parsed.success) return { error: "invalid" };
  const { orderItemId, ...input } = parsed.data;
  const result = await saveReview(user.id, orderItemId, input);
  if (result.ok) refresh();
  return result;
}

export async function deleteReviewAction(_prev: ReviewState, formData: FormData): Promise<ReviewState> {
  const user = await signedIn("review");
  if (!user || user === "limited") return { error: "not_allowed" };
  const result = await deleteOwnReview(user.id, String(formData.get("reviewId") ?? ""));
  if (result.ok) refresh();
  return result.ok ? { ok: true } : { error: "not_found" };
}

export async function flagReviewAction(_prev: ReviewState, formData: FormData): Promise<ReviewState> {
  const user = await signedIn("flag");
  if (!user) return { error: "not_allowed" };
  if (user === "limited") return { error: "rateLimited" };
  const reason = z.string().trim().min(3).max(300).safeParse(formData.get("reason"));
  if (!reason.success) return { error: "invalid" };
  return flagReview(user.id, String(formData.get("reviewId") ?? ""), reason.data);
}

/** Saves or un-saves a product. `saved` is null when the visitor isn't signed in. */
export async function toggleWishlistAction(productId: string): Promise<{ saved: boolean | null }> {
  const user = await signedIn("wishlist");
  if (!user || user === "limited") return { saved: null };
  const saved = await toggleSaved(user.id, String(productId).slice(0, 40));
  refresh();
  return { saved };
}

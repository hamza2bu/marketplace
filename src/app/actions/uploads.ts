"use server";

import { getCurrentUser } from "@/server/auth/guards";
import { rateLimit } from "@/server/rate-limit";
import { uploadTarget, type UploadTarget } from "@/server/storage";

/**
 * Where the browser should upload an image: a signed Cloudinary upload or the
 * local dev endpoint. Sellers upload into their shop's folder, admins into the
 * marketplace's own.
 */
export async function prepareImageUploadAction(): Promise<UploadTarget> {
  const user = await getCurrentUser();
  if (!user) return { kind: "none" };
  if (!(await rateLimit("account", "upload-target", user.id)).ok) return { kind: "none" };
  if (user.role === "ADMIN") return uploadTarget("admin");
  if (user.role === "SELLER" && user.shop && user.shop.status !== "REMOVED") return uploadTarget(`shops/${user.shop.id}`);
  return { kind: "none" };
}

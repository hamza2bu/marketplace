import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { sniffImageType, MAX_IMAGE_BYTES } from "@/lib/images";

// Product images go to Cloudinary when CLOUDINARY_* is set: the browser
// uploads straight to Cloudinary with a short-lived signature from us.
// Without Cloudinary (local development), files are stored on disk under
// storage/uploads and served by /uploads/[name].

export const LOCAL_UPLOAD_DIR = path.join(process.cwd(), "storage", "uploads");

export function cloudinaryConfig() {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  return cloud && apiKey && apiSecret ? { cloud, apiKey, apiSecret } : null;
}

export function localUploadsEnabled(): boolean {
  return !cloudinaryConfig() && (process.env.NODE_ENV !== "production" || process.env.ALLOW_LOCAL_UPLOADS === "true");
}

export type UploadTarget =
  | { kind: "cloudinary"; url: string; fields: Record<string, string> }
  | { kind: "local"; url: string; fields: Record<string, string> }
  | { kind: "none" };

/** Where the browser should send an image, for this shop. */
export function uploadTarget(shopId: string): UploadTarget {
  const cfg = cloudinaryConfig();
  if (cfg) {
    const params: Record<string, string> = {
      allowed_formats: "jpg,png,webp",
      folder: `marketplace/shops/${shopId}`,
      timestamp: String(Math.floor(Date.now() / 1000)),
    };
    const toSign = Object.keys(params)
      .sort()
      .map((k) => `${k}=${params[k]}`)
      .join("&");
    const signature = createHash("sha1").update(toSign + cfg.apiSecret).digest("hex");
    return {
      kind: "cloudinary",
      url: `https://api.cloudinary.com/v1_1/${cfg.cloud}/image/upload`,
      fields: { ...params, api_key: cfg.apiKey, signature },
    };
  }
  if (localUploadsEnabled()) return { kind: "local", url: "/api/uploads", fields: {} };
  return { kind: "none" };
}

export class UploadError extends Error {
  constructor(public code: "too_large" | "bad_type" | "disabled") {
    super(code);
  }
}

/** Saves an uploaded image to local storage (development only). Returns its public URL. */
export async function saveLocalImage(file: File): Promise<string> {
  if (!localUploadsEnabled()) throw new UploadError("disabled");
  if (file.size > MAX_IMAGE_BYTES) throw new UploadError("too_large");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImageType(bytes);
  if (!type) throw new UploadError("bad_type");
  const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[type];
  const name = `${randomBytes(16).toString("hex")}.${ext}`;
  await mkdir(LOCAL_UPLOAD_DIR, { recursive: true });
  await writeFile(path.join(LOCAL_UPLOAD_DIR, name), bytes);
  return `/uploads/${name}`;
}

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** Detects JPEG/PNG/WebP from the file's first bytes (never trust the declared type). */
export function sniffImageType(bytes: Uint8Array): (typeof IMAGE_TYPES)[number] | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

/**
 * Image URLs a product may use: our Cloudinary account, local dev uploads,
 * and the seed placeholders. Anything else is rejected, so sellers can't
 * hot-link arbitrary sites.
 */
export function isAllowedImageUrl(url: string, cloudinaryCloud?: string): boolean {
  if (/^\/uploads\/[a-zA-Z0-9_-]+\.(jpg|png|webp)$/.test(url)) return true;
  if (/^\/placeholder\/[a-z0-9-]+\.svg(\?[a-z0-9=&]+)?$/.test(url)) return true;
  if (cloudinaryCloud) {
    const prefix = `https://res.cloudinary.com/${cloudinaryCloud}/image/upload/`;
    return url.startsWith(prefix) && !url.includes("..") && url.length < 500;
  }
  return false;
}

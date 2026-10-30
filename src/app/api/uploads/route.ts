import { getCurrentUser } from "@/server/auth/guards";
import { rateLimit } from "@/server/rate-limit";
import { saveLocalImage, UploadError } from "@/server/storage";

// Local-development image uploads (Cloudinary uploads go straight from the
// browser to Cloudinary). Sellers and admins only.
export async function POST(request: Request) {
  const user = await getCurrentUser();
  const seller = user?.role === "SELLER" && user.shop && user.shop.status !== "REMOVED";
  if (!user || (!seller && user.role !== "ADMIN")) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  if (!(await rateLimit("account", "upload", user.id)).ok) return Response.json({ error: "rate_limited" }, { status: 429 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "bad_request" }, { status: 400 });
  try {
    const url = await saveLocalImage(file);
    return Response.json({ url, publicId: null });
  } catch (error) {
    if (error instanceof UploadError) {
      return Response.json({ error: error.code }, { status: error.code === "disabled" ? 404 : 400 });
    }
    throw error;
  }
}

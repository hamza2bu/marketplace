import { getCurrentUser } from "@/server/auth/guards";
import { isSaved } from "@/server/wishlist";

// Whether the signed-in visitor saved this product (product pages are cached,
// so this is asked for from the browser).
export async function GET(_request: Request, ctx: RouteContext<"/api/wishlist/[productId]">) {
  const { productId } = await ctx.params;
  const user = await getCurrentUser();
  const saved = user ? await isSaved(user.id, productId.slice(0, 40)) : null;
  return Response.json({ saved }, { headers: { "Cache-Control": "private, no-store" } });
}

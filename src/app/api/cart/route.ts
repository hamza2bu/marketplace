import { getCartItemCount } from "@/server/cart";

// Item count for the header badge (the header itself is static).
export async function GET() {
  return Response.json({ count: await getCartItemCount() }, { headers: { "Cache-Control": "private, no-store" } });
}

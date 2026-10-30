import { timingSafeEqual } from "node:crypto";
import { refreshDiscountBoundaries } from "@/server/discounts";
import { sendQueuedEmails } from "@/server/email";
import { expireUnpaidOrders, releaseDueFunds } from "@/server/payments/service";

// Run every 5 minutes from a scheduler (Vercel Cron, a system cron, …):
//   curl -H "Authorization: Bearer $CRON_SECRET" https://<site>/api/cron/maintenance
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (!secret || given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const expiredOrders = await expireUnpaidOrders();
  const releasedSubOrders = await releaseDueFunds();
  const repricedProducts = await refreshDiscountBoundaries();
  // Retries emails that failed when they were first sent.
  const emails = await sendQueuedEmails();
  return Response.json({ expiredOrders, releasedSubOrders, repricedProducts, emails });
}

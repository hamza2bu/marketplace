import { timingSafeEqual } from "node:crypto";
import { expireUnpaidOrders, releaseDueFunds } from "@/server/payments/service";

// Run every few minutes from a scheduler (Vercel Cron, a system cron, …):
//   curl -H "Authorization: Bearer $CRON_SECRET" https://<site>/api/cron/maintenance
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (!secret || given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const [expiredOrders, releasedSubOrders] = [await expireUnpaidOrders(), await releaseDueFunds()];
  return Response.json({ expiredOrders, releasedSubOrders });
}

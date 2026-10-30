import Papa from "papaparse";
import { getCurrentUser } from "@/server/auth/guards";
import { REPORT_RANGES, subOrderLedgerRows, type ReportDays } from "@/server/admin/reports";

const shekels = (minor: number) => (minor / 100).toFixed(2);

// Accounting export: one row per paid sub-order in the period. Admins only.
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (user?.role !== "ADMIN") return new Response("Forbidden", { status: 403 });
  const daysParam = Number(new URL(request.url).searchParams.get("days"));
  const days: ReportDays = REPORT_RANGES.find((r) => r === daysParam) ?? 30;

  const rows = (await subOrderLedgerRows(days)).map((s) => ({
    order: s.order.number,
    paid_at: s.order.paidAt?.toISOString() ?? "",
    shop: s.shop.name,
    shop_tax_id: s.shop.taxId,
    status: s.status,
    payout_status: s.transferStatus,
    items: shekels(s.subtotalMinor),
    shipping: shekels(s.shippingMinor),
    commission: shekels(s.commissionMinor),
    seller_net: shekels(s.sellerNetMinor),
    refunded: shekels(s.refunds.reduce((n, r) => n + r.amountMinor, 0)),
  }));
  // escapeFormulae stops spreadsheet apps from running cell values like "=…" as formulas.
  const csv = Papa.unparse(rows, { escapeFormulae: true });
  return new Response(`﻿${csv}\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="marketplace-${days}d.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}

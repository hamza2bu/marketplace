import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ActionForm } from "@/components/admin/action-form";
import { DisputeThread } from "@/components/admin/dispute-thread";
import { formatMoney } from "@/lib/money";
import { requireAdmin } from "@/server/auth/guards";
import { listDisputes } from "@/server/admin/orders";
import { disputeMessageAction, resolveDisputeAction } from "../actions";

export const metadata: Metadata = { robots: { index: false } };
const input = "w-full rounded-md border border-border bg-background px-2 py-1.5 text-base";

export default async function AdminDisputesPage({ params }: PageProps<"/[locale]/admin/disputes">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin(locale);
  const [t, common, ordersT, disputes] = await Promise.all([
    getTranslations("admin.disputes"),
    getTranslations("admin.common"),
    getTranslations("admin.orders"),
    listDisputes(),
  ]);
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      {disputes.length === 0 ? (
        <p className="py-8 text-center text-muted">{common("none")}</p>
      ) : (
        <ul className="space-y-4">
          {disputes.map((d) => (
            <li key={d.id} className="space-y-3 rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`/admin/orders/${d.subOrder.order.number}`} dir="ltr" className="font-semibold text-brand underline">
                  {d.subOrder.order.number}
                </Link>
                <span className="rounded-full bg-surface px-2 py-0.5 text-xs">{t(`status.${d.status}`)}</span>
              </div>
              <p className="text-xs text-muted">
                {d.subOrder.shop.name} · {t("openedBy", { email: d.openedBy.email, date: dateFmt.format(d.createdAt) })} ·{" "}
                {formatMoney(d.subOrder.subtotalMinor + d.subOrder.shippingMinor, locale)}
              </p>
              <DisputeThread messages={d.messages} locale={locale} />
              <div className="grid gap-4 md:grid-cols-2">
                <ActionForm action={disputeMessageAction} errors="admin.orders.errors">
                  <input type="hidden" name="disputeId" value={d.id} />
                  <textarea name="message" required rows={2} placeholder={t("message")} aria-label={t("message")} className={input} />
                  <button className="rounded-md border border-border px-3 py-1.5 text-sm">{t("send")}</button>
                </ActionForm>
                <ActionForm action={resolveDisputeAction} errors="admin.orders.errors" confirm={common("confirm")}>
                  <input type="hidden" name="disputeId" value={d.id} />
                  <textarea name="resolution" required rows={2} placeholder={t("resolution")} aria-label={t("resolution")} className={input} />
                  <input name="amount" inputMode="decimal" dir="ltr" placeholder={t("refundAmount")} aria-label={t("refundAmount")} className={input} />
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="restock" className="size-4 accent-brand" />
                    {ordersT("restock")}
                  </label>
                  <button className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-brand-foreground">{t("resolve")}</button>
                </ActionForm>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

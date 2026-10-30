import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ActionForm } from "@/components/admin/action-form";
import { formatMoney } from "@/lib/money";
import { requireAdmin } from "@/server/auth/guards";
import { payableShops, recentPayouts } from "@/server/admin/payouts";
import { payoutAction, revealBankAction } from "../actions";

export const metadata: Metadata = { robots: { index: false } };

export default async function AdminPayoutsPage({ params }: PageProps<"/[locale]/admin/payouts">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin(locale);
  const [t, common, shopsT, due, history] = await Promise.all([
    getTranslations("admin.payouts"),
    getTranslations("admin.common"),
    getTranslations("admin.shops"),
    payableShops(),
    recentPayouts(),
  ]);
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted">{t("intro")}</p>
      </div>
      <section className="space-y-3">
        <h2 className="font-semibold">{t("due")}</h2>
        {due.length === 0 ? (
          <p className="text-sm text-muted">{common("none")}</p>
        ) : (
          <ul className="space-y-3">
            {due.map((s) => (
              <li key={s.id} className="grid gap-3 rounded-lg border border-border p-4 md:grid-cols-[1fr_auto]">
                <div className="space-y-1 text-sm">
                  <Link href={`/admin/shops/${s.id}`} className="font-semibold text-brand underline">
                    {s.name}
                  </Link>
                  <p className="text-muted">
                    {s.legalName} · •••• {s.payoutBankLast4 ?? "—"}
                  </p>
                  <p className="text-lg font-bold">
                    {t("available")}: {formatMoney(s.availableMinor, locale)}
                  </p>
                  <ActionForm action={revealBankAction} errors="admin.shops.errors">
                    <input type="hidden" name="shopId" value={s.id} />
                    <button className="text-brand underline">{shopsT("reveal")}</button>
                  </ActionForm>
                </div>
                <ActionForm action={payoutAction} errors="admin.payouts.errors" confirm={common("confirm")} className="space-y-2 md:w-64">
                  <input type="hidden" name="shopId" value={s.id} />
                  <label className="block text-sm">
                    <span className="mb-1 block">{t("reference")}</span>
                    <input name="reference" required dir="ltr" className="w-full rounded-md border border-border bg-background px-2 py-1.5" />
                  </label>
                  <button className="w-full rounded-md bg-brand px-3 py-2 text-sm font-semibold text-brand-foreground">{t("record")}</button>
                </ActionForm>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold">{t("history")}</h2>
        {history.length === 0 ? (
          <p className="text-sm text-muted">{common("none")}</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border text-sm">
            {history.map((p) => (
              <li key={p.id} className="flex flex-wrap justify-between gap-2 p-3">
                <span>{p.shop.name}</span>
                <span className="text-muted">{dateFmt.format(p.paidAt ?? p.createdAt)}</span>
                <span dir="ltr" className="text-muted">
                  {p.providerRefs.join(", ")}
                </span>
                <span className="font-semibold">{formatMoney(p.amountMinor, locale)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

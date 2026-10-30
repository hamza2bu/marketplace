import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ActionForm } from "@/components/admin/action-form";
import { minorToInput } from "@/lib/money";
import { requireAdmin } from "@/server/auth/guards";
import { getPlatformSettings } from "@/server/settings";
import { settingsAction } from "../actions";

export const metadata: Metadata = { robots: { index: false } };
const input = "w-full rounded-md border border-border bg-background px-2 py-1.5 text-base";

export default async function AdminSettingsPage({ params }: PageProps<"/[locale]/admin/settings">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin(locale);
  const [t, common, s] = await Promise.all([getTranslations("admin.settings"), getTranslations("admin.common"), getPlatformSettings()]);
  const fields = [
    ["globalCommission", t("globalCommission"), String(s.globalCommissionBps / 100)],
    ["vat", t("vat"), String(s.vatBps / 100)],
    ["shippingFlat", t("shippingFlat"), minorToInput(s.shippingFlatMinor)],
    ["freeShippingOver", t("freeShippingOver"), minorToInput(s.freeShippingOverMinor)],
    ["returnWindow", t("returnWindow"), String(s.returnWindowDays)],
    ["paymentWindow", t("paymentWindow"), String(s.paymentWindowMinutes)],
  ] as const;

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="text-sm text-muted">{t("note")}</p>
      <ActionForm action={settingsAction} errors="admin.common" success={common("saved")} className="grid gap-4 sm:grid-cols-2">
        {fields.map(([name, label, value]) => (
          <label key={name} className="text-sm">
            <span className="mb-1 block font-medium">{label}</span>
            <input name={name} defaultValue={value} inputMode="decimal" dir="ltr" required className={input} />
          </label>
        ))}
        <div className="sm:col-span-2">
          <button className="rounded-md bg-brand px-4 py-2 font-semibold text-brand-foreground">{common("save")}</button>
        </div>
      </ActionForm>
    </div>
  );
}

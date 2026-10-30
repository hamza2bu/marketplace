"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Field } from "@/components/ui/field";
import { useErrorText } from "@/components/ui/use-error-text";
import { ImagePicker } from "@/components/ui/image-picker";
import { saveBankAction, saveShopProfileAction, type SettingsState } from "./actions";

export function ProfileForm({ shop }: { shop: { name: string; description: string | null; contactEmail: string; contactPhone: string; logoUrl: string | null; bannerUrl: string | null } }) {
  const t = useTranslations("seller.settings");
  const sell = useTranslations("sell");
  const locale = useLocale();
  const err = useErrorText();
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveShopProfileAction, {});
  return (
    <form action={action} key={JSON.stringify(state.values ?? {})} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="locale" value={locale} />
      <Field label={sell("shopName")} name="name" defaultValue={state.values?.name ?? shop.name} required error={err(state.fieldErrors?.name)} />
      <Field label={sell("contactEmail")} name="contactEmail" type="email" dir="ltr" defaultValue={state.values?.contactEmail ?? shop.contactEmail} error={err(state.fieldErrors?.contactEmail)} />
      <Field label={sell("contactPhone")} name="contactPhone" type="tel" dir="ltr" defaultValue={state.values?.contactPhone ?? shop.contactPhone} error={err(state.fieldErrors?.contactPhone)} />
      <div className="sm:col-span-2">
        <label htmlFor="description" className="mb-1 block text-sm font-medium">
          {sell("description")}
        </label>
        <textarea id="description" name="description" defaultValue={state.values?.description ?? shop.description ?? ""} rows={3} maxLength={1000} className="w-full rounded-md border border-border bg-background p-2 text-base" />
      </div>
      <ImagePicker name="logoUrl" label={t("logo")} initial={state.values?.logoUrl ?? shop.logoUrl} />
      <ImagePicker name="bannerUrl" label={t("banner")} initial={state.values?.bannerUrl ?? shop.bannerUrl} wide />
      <div className="sm:col-span-2">
        <button disabled={pending} className="rounded-md bg-brand px-4 py-2 font-semibold text-brand-foreground disabled:opacity-60">
          {t("save")}
        </button>
        {state.ok && <span role="status" className="ms-3 text-sm text-brand">{t("saved")}</span>}
        {state.error && <span role="alert" className="ms-3 text-sm text-danger">{err(state.error)}</span>}
      </div>
    </form>
  );
}

export function BankForm() {
  const t = useTranslations("seller.settings");
  const sell = useTranslations("sell");
  const locale = useLocale();
  const err = useErrorText();
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveBankAction, {});
  return (
    <details className="rounded-md border border-border p-3">
      <summary className="cursor-pointer text-sm font-medium">{t("updateBank")}</summary>
      <form action={action} key={JSON.stringify(state.values ?? {})} className="mt-3 grid gap-3 sm:grid-cols-3">
        <input type="hidden" name="locale" value={locale} />
        <div className="sm:col-span-3">
          <Field label={sell("holderName")} name="holderName" defaultValue={state.values?.holderName} required error={err(state.fieldErrors?.holderName)} />
        </div>
        <Field label={sell("bankCode")} name="bankCode" defaultValue={state.values?.bankCode} inputMode="numeric" dir="ltr" maxLength={2} error={err(state.fieldErrors?.bankCode)} />
        <Field label={sell("branch")} name="branch" defaultValue={state.values?.branch} inputMode="numeric" dir="ltr" maxLength={3} error={err(state.fieldErrors?.branch)} />
        <Field label={sell("account")} name="account" defaultValue={state.values?.account} inputMode="numeric" dir="ltr" maxLength={9} error={err(state.fieldErrors?.account)} />
        <div className="sm:col-span-3">
          <button disabled={pending} className="rounded-md border border-brand px-4 py-2 font-medium text-brand disabled:opacity-60">
            {t("save")}
          </button>
          {state.ok && <span role="status" className="ms-3 text-sm text-brand">{t("saved")}</span>}
        </div>
      </form>
    </details>
  );
}

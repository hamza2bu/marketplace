"use client";

import { useActionState, useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Field } from "@/components/ui/field";
import { useErrorText } from "@/components/ui/use-error-text";
import { applyToSellAction, type OnboardingState } from "./actions";

export function OnboardingForm({ defaultEmail }: { defaultEmail: string }) {
  const t = useTranslations("sell");
  const locale = useLocale();
  const err = useErrorText();
  const [state, action, pending] = useActionState<OnboardingState, FormData>(applyToSellAction, {});
  const fe = (name: string) => err(state.fieldErrors?.[name]);
  const v = (name: string) => state.values?.[name];

  useEffect(() => {
    // A full page load on purpose, so the header's client session picks up the new seller role.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    if (state.ok) window.location.assign(`/${locale}/seller`);
  }, [state.ok, locale]);

  return (
    <form action={action} className="space-y-8" noValidate key={JSON.stringify(state.values ?? {})}>
      <input type="hidden" name="locale" value={locale} />
      {state.error && (
        <p role="alert" className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {err(state.error)}
        </p>
      )}

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-lg font-semibold">{t("shopSection")}</legend>
        <Field label={t("shopName")} name="name" defaultValue={v("name")} required error={fe("name")} />
        <Field label={t("slug")} name="slug" defaultValue={v("slug")} required dir="ltr" hint={t("slugHint")} error={fe("slug")} />
        <div className="sm:col-span-2">
          <label htmlFor="description" className="mb-1 block text-sm font-medium">
            {t("description")}
          </label>
          <textarea id="description" name="description" defaultValue={v("description")} rows={3} maxLength={1000} className="w-full rounded-md border border-border bg-background p-2 text-base" />
        </div>
        <Field label={t("contactEmail")} name="contactEmail" type="email" dir="ltr" defaultValue={v("contactEmail") ?? defaultEmail} required error={fe("contactEmail")} />
        <Field label={t("contactPhone")} name="contactPhone" defaultValue={v("contactPhone")} type="tel" dir="ltr" required error={fe("contactPhone")} />
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-lg font-semibold">{t("businessSection")}</legend>
        <Field label={t("legalName")} name="legalName" defaultValue={v("legalName")} required error={fe("legalName")} />
        <Field label={t("taxId")} name="taxId" defaultValue={v("taxId")} inputMode="numeric" dir="ltr" required error={fe("taxId")} />
        <div className="sm:col-span-2">
          <Field label={t("addressLine1")} name="addressLine1" defaultValue={v("addressLine1")} required error={fe("addressLine1")} />
        </div>
        <Field label={t("city")} name="city" defaultValue={v("city")} required error={fe("city")} />
        <Field label={t("postalCode")} name="postalCode" defaultValue={v("postalCode")} inputMode="numeric" dir="ltr" required error={fe("postalCode")} />
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-lg font-semibold">{t("payoutSection")}</legend>
        <div className="sm:col-span-2">
          <Field label={t("holderName")} name="holderName" defaultValue={v("holderName")} required error={fe("holderName")} />
        </div>
        <Field label={t("bankCode")} name="bankCode" defaultValue={v("bankCode")} inputMode="numeric" dir="ltr" maxLength={2} required error={fe("bankCode")} />
        <Field label={t("branch")} name="branch" defaultValue={v("branch")} inputMode="numeric" dir="ltr" maxLength={3} required error={fe("branch")} />
        <div className="sm:col-span-2">
          <Field label={t("account")} name="account" defaultValue={v("account")} inputMode="numeric" dir="ltr" maxLength={9} required error={fe("account")} />
        </div>
        <p className="text-sm text-muted sm:col-span-2">{t("bankNote")}</p>
      </fieldset>

      <div className="space-y-1">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="acceptTerms" className="mt-0.5 size-4 accent-brand" />
          {t("acceptTerms")}
        </label>
        {fe("acceptTerms") && <p className="text-sm text-danger">{fe("acceptTerms")}</p>}
      </div>

      <button type="submit" disabled={pending || state.ok} className="w-full rounded-md bg-brand px-4 py-3 font-semibold text-brand-foreground disabled:opacity-60 sm:w-auto">
        {pending || state.ok ? t("submitting") : t("submit")}
      </button>
    </form>
  );
}

"use client";

import { useActionState, useEffect, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Field } from "@/components/ui/field";
import { saveAddressAction, type AddressFormState } from "@/app/[locale]/checkout/actions";

export function AddressForm({ submitLabel }: { submitLabel: string }) {
  const t = useTranslations("addresses");
  const errors = useTranslations("errors");
  const locale = useLocale();
  const form = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<AddressFormState, FormData>(saveAddressAction, {});
  const err = (key?: string) => (key ? (errors.has(key) ? errors(key) : errors("generic")) : undefined);
  const v = state.values ?? {};

  useEffect(() => {
    if (state.ok) form.current?.reset();
  }, [state]);

  return (
    <form ref={form} action={action} className="grid gap-4 sm:grid-cols-2" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <Field label={t("fullName")} name="fullName" autoComplete="name" required defaultValue={v.fullName} error={err(state.fieldErrors?.fullName)} />
      <Field label={t("phone")} name="phone" type="tel" autoComplete="tel" dir="ltr" required defaultValue={v.phone} error={err(state.fieldErrors?.phone)} />
      <div className="sm:col-span-2">
        <Field label={t("line1")} name="line1" autoComplete="address-line1" required defaultValue={v.line1} error={err(state.fieldErrors?.line1)} />
      </div>
      <div className="sm:col-span-2">
        <Field label={t("line2")} name="line2" autoComplete="address-line2" defaultValue={v.line2} error={err(state.fieldErrors?.line2)} />
      </div>
      <Field label={t("city")} name="city" autoComplete="address-level2" required defaultValue={v.city} error={err(state.fieldErrors?.city)} />
      <Field label={t("postalCode")} name="postalCode" inputMode="numeric" autoComplete="postal-code" dir="ltr" required defaultValue={v.postalCode} error={err(state.fieldErrors?.postalCode)} />
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" name="isDefault" className="size-4 accent-brand" />
        {t("isDefault")}
      </label>
      <div className="sm:col-span-2">
        <button type="submit" disabled={pending} className="rounded-md border border-brand px-4 py-2 font-medium text-brand disabled:opacity-50">
          {submitLabel}
        </button>
        {state.ok && <span role="status" className="ms-3 text-sm text-brand">{t("saved")}</span>}
      </div>
    </form>
  );
}

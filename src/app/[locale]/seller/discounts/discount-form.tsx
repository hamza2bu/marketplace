"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useErrorText } from "@/components/ui/use-error-text";
import { createDiscountAction, type DiscountFormState } from "./actions";

export function DiscountForm({ products, defaults }: { products: { id: string; title: string }[]; defaults: { startsAt: string; endsAt: string } }) {
  const t = useTranslations("seller.discounts");
  const locale = useLocale();
  const err = useErrorText();
  const form = useRef<HTMLFormElement>(null);
  const [type, setType] = useState<"PERCENT" | "FIXED">("PERCENT");
  const [state, action, pending] = useActionState<DiscountFormState, FormData>(createDiscountAction, {});
  const input = "w-full rounded-md border border-border bg-background px-2 py-1.5 text-base";

  useEffect(() => {
    if (state.ok) form.current?.reset();
  }, [state]);

  return (
    <form ref={form} key={JSON.stringify(state.values ?? {})} action={action} className="grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-2">
      <input type="hidden" name="locale" value={locale} />
      <h2 className="font-semibold sm:col-span-2">{t("new")}</h2>
      <label className="text-sm sm:col-span-2">
        <span className="mb-1 block font-medium">{t("appliesTo")}</span>
        <select name="productId" defaultValue={state.values?.productId} className={input}>
          <option value="">{t("wholeShop")}</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="mb-1 block font-medium">{t("type")}</span>
        <select name="type" value={type} onChange={(e) => setType(e.target.value as "PERCENT" | "FIXED")} className={input}>
          <option value="PERCENT">{t("percent")}</option>
          <option value="FIXED">{t("fixed")}</option>
        </select>
      </label>
      <label className="text-sm">
        <span className="mb-1 block font-medium">
          {t("value")} ({type === "PERCENT" ? "%" : "₪"})
        </span>
        <input name="value" defaultValue={state.values?.value} inputMode="decimal" dir="ltr" required className={input} />
        {state.fieldErrors?.value && <span className="text-danger">{err(state.fieldErrors.value)}</span>}
      </label>
      <label className="text-sm">
        <span className="mb-1 block font-medium">{t("startsAt")}</span>
        <input type="datetime-local" name="startsAt" defaultValue={state.values?.startsAt ?? defaults.startsAt} required className={input} />
        {state.fieldErrors?.startsAt && <span className="text-danger">{err(state.fieldErrors.startsAt)}</span>}
      </label>
      <label className="text-sm">
        <span className="mb-1 block font-medium">{t("endsAt")}</span>
        <input type="datetime-local" name="endsAt" defaultValue={state.values?.endsAt ?? defaults.endsAt} required className={input} />
        {state.fieldErrors?.endsAt && <span className="text-danger">{err(state.fieldErrors.endsAt)}</span>}
      </label>
      {state.error && (
        <p role="alert" className="text-sm text-danger sm:col-span-2">
          {err(state.error)}
        </p>
      )}
      <div className="sm:col-span-2">
        <button disabled={pending} className="rounded-md bg-brand px-4 py-2 font-semibold text-brand-foreground disabled:opacity-60">
          {t("create")}
        </button>
      </div>
    </form>
  );
}

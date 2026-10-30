"use client";

import { useActionState, useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { placeOrderAction, type PlaceOrderState } from "./actions";

type Address = { id: string; fullName: string; line1: string; line2: string | null; city: string; postalCode: string; phone: string; isDefault: boolean };

export function PlaceOrderForm({
  addresses,
  checkoutToken,
  submitLabel,
}: {
  addresses: Address[];
  checkoutToken: string;
  submitLabel: string;
}) {
  const t = useTranslations("checkout");
  const locale = useLocale();
  const [state, action, pending] = useActionState<PlaceOrderState, FormData>(placeOrderAction, {});
  const redirecting = Boolean(state.redirectUrl);

  useEffect(() => {
    // Off to the payment page (a full page load: it's usually another site).
    if (state.redirectUrl) window.location.assign(state.redirectUrl);
  }, [state.redirectUrl]);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="checkoutToken" value={checkoutToken} />
      <fieldset className="space-y-2">
        <legend className="sr-only">{t("shippingAddress")}</legend>
        {addresses.map((a) => (
          <label key={a.id} className="flex cursor-pointer gap-3 rounded-lg border border-border p-3 has-checked:border-brand has-checked:bg-brand/5">
            <input type="radio" name="addressId" value={a.id} defaultChecked={a.isDefault} required className="mt-1 size-4 accent-brand" />
            <span className="text-sm">
              <span className="block font-medium">{a.fullName}</span>
              {a.line1}
              {a.line2 ? `, ${a.line2}` : ""}, {a.city} {a.postalCode}
              <span className="block text-muted" dir="ltr">
                {a.phone}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      {state.error && (
        <p role="alert" className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {t(`error.${state.error}`)}{" "}
          {state.error === "already_placed" && state.orderNumber && (
            <Link href={`/account/orders/${state.orderNumber}`} className="font-semibold underline">
              {t("viewOrder")}
            </Link>
          )}
          {(state.error === "cart_changed" || state.error === "out_of_stock" || state.error === "empty_cart") && (
            <Link href="/cart" className="font-semibold underline">
              {t("backToCart")}
            </Link>
          )}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || redirecting || addresses.length === 0}
        className="w-full rounded-md bg-brand px-4 py-3 text-lg font-semibold text-brand-foreground disabled:opacity-60"
      >
        {pending || redirecting ? t("placing") : submitLabel}
      </button>
    </form>
  );
}

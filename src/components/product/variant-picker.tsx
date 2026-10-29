"use client";

import { useMemo, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Price } from "@/components/catalog/price";
import { findVariant, isValueAvailable, optionAxes, type VariantLike } from "@/lib/variant-options";
import { Link } from "@/i18n/navigation";
import { addToCartAction } from "@/app/[locale]/cart/actions";
import { CART_CHANGED_EVENT } from "@/components/layout/cart-link";

const LOW_STOCK = 5;

export function VariantPicker({ variants }: { variants: (VariantLike & { sku: string })[] }) {
  const t = useTranslations("product");
  const locale = useLocale();
  const axes = useMemo(() => optionAxes(variants), [variants]);
  const initial = variants.find((v) => v.stock > 0) ?? variants[0];
  const [selection, setSelection] = useState<Record<string, string>>(initial?.attributes ?? {});
  const variant = findVariant(variants, selection);
  const [quantity, setQuantity] = useState(1);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const maxQuantity = Math.min(20, variant?.stock ?? 0);

  function add() {
    if (!variant) return;
    setMessage(null);
    startTransition(async () => {
      const result = await addToCartAction(variant.id, Math.min(quantity, maxQuantity));
      if (result.ok) {
        setMessage({ kind: "ok", text: t("added") });
        window.dispatchEvent(new Event(CART_CHANGED_EVENT));
      } else {
        setMessage({ kind: "error", text: t(`addError.${result.error}`) });
      }
    });
  }

  const axisLabel = (name: string) => (t.has(`options.${name}`) ? t(`options.${name}` as "options.color") : name);
  const discount =
    variant?.compareAtMinor && variant.compareAtMinor > variant.priceMinor
      ? Math.round((1 - variant.priceMinor / variant.compareAtMinor) * 100)
      : 0;

  return (
    <div className="space-y-5">
      {variant && (
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <Price amount={variant.priceMinor} compareAt={discount ? variant.compareAtMinor : null} locale={locale} size="lg" />
            {discount > 0 && (
              <span className="rounded bg-danger px-2 py-0.5 text-sm font-bold text-white">{t("save", { pct: discount })}</span>
            )}
          </div>
          <p className="text-xs text-muted">{t("vatIncluded")}</p>
        </div>
      )}

      {axes.map((axis) => (
        <fieldset key={axis.name}>
          <legend className="mb-2 text-sm font-medium">
            {axisLabel(axis.name)}: <span className="font-normal text-muted">{selection[axis.name]}</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {axis.values.map((value) => {
              const available = isValueAvailable(variants, selection, axis.name, value);
              const selected = selection[axis.name] === value;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={selected}
                  aria-label={available ? value : t("unavailable", { value })}
                  onClick={() => {
                    const next = { ...selection, [axis.name]: value };
                    // If that combination doesn't exist, jump to one that has this value.
                    const match =
                      findVariant(variants, next) ??
                      variants.find((v) => v.attributes[axis.name] === value && v.stock > 0) ??
                      variants.find((v) => v.attributes[axis.name] === value);
                    setSelection(match ? match.attributes : next);
                  }}
                  className={`min-w-12 rounded-md border px-3 py-2 text-sm ${
                    selected ? "border-brand bg-brand/10 font-semibold" : "border-border"
                  } ${available ? "" : "text-muted line-through"}`}
                >
                  {value}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}

      {variant && (
        <p className={`text-sm font-medium ${variant.stock > 0 ? "text-brand" : "text-danger"}`}>
          {variant.stock <= 0 ? t("outOfStock") : variant.stock <= LOW_STOCK ? t("lowStock", { count: variant.stock }) : t("inStock")}
        </p>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block font-medium">{t("quantity")}</span>
          <select
            value={Math.min(quantity, Math.max(1, maxQuantity))}
            onChange={(e) => setQuantity(Number(e.target.value))}
            disabled={maxQuantity < 1}
            className="rounded-md border border-border bg-background px-3 py-2.5"
          >
            {Array.from({ length: Math.max(1, maxQuantity) }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={add}
          disabled={!variant || variant.stock <= 0 || pending}
          className="flex-1 rounded-md bg-brand px-6 py-3 font-semibold text-brand-foreground disabled:opacity-50 sm:flex-none"
        >
          {pending ? t("adding") : t("addToCart")}
        </button>
      </div>
      {message && (
        <p role="status" className={`text-sm ${message.kind === "ok" ? "text-brand" : "text-danger"}`}>
          {message.text}{" "}
          {message.kind === "ok" && (
            <Link href="/cart" className="font-semibold underline">
              {t("viewCart")}
            </Link>
          )}
        </p>
      )}

      {variant && (
        <p className="text-xs text-muted">
          {t("sku")}: <span dir="ltr">{variant.sku}</span>
        </p>
      )}
    </div>
  );
}

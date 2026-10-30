"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useErrorText } from "@/components/ui/use-error-text";
import { parseMoney } from "@/lib/money";
import { expandOptions } from "@/lib/variants";
import { slugify } from "@/lib/validation/seller";
import { saveProductAction, type SaveProductState } from "@/app/[locale]/seller/products/actions";
import { ImageUploader, type UploadedImage } from "./image-uploader";

type VariantRow = {
  id?: string;
  attributes: Record<string, string>;
  sku: string;
  price: string;
  compareAt: string;
  stock: string;
  isActive: boolean;
};

export type ProductFormValues = {
  id?: string;
  title: string;
  slug: string;
  categoryId: string;
  brandName: string;
  description: string;
  images: UploadedImage[];
  specs: { key: string; value: string }[];
  options: { name: string; values: string }[];
  variants: VariantRow[];
  status?: string;
};

type Category = { id: string; label: string; group: string };

const attrKey = (a: Record<string, string>) => JSON.stringify(Object.entries(a).sort());

const inputClass = "w-full rounded-md border border-border bg-background px-2 py-1.5 text-base aria-invalid:border-danger";

export function ProductForm({
  initial,
  categories,
  shopPending,
  justSaved = false,
}: {
  initial: ProductFormValues;
  categories: Category[];
  shopPending: boolean;
  justSaved?: boolean;
}) {
  const t = useTranslations("seller.form");
  const locale = useLocale();
  const router = useRouter();
  const err = useErrorText();
  const [values, setValues] = useState(initial);
  const [state, setState] = useState<SaveProductState>(justSaved ? { ok: true } : {});
  const [pending, startTransition] = useTransition();
  const fe = (path: string) => err(state.fieldErrors?.[path]);
  const set = <K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) => setValues((v) => ({ ...v, [key]: value }));

  function generateVariants() {
    const options = Object.fromEntries(
      values.options
        .map((o): [string, string[]] => [o.name.trim().toLowerCase(), [...new Set(o.values.split(",").map((v) => v.trim()).filter(Boolean))]])
        .filter(([name, vals]) => name && vals.length),
    );
    const existing = new Map(values.variants.map((v) => [attrKey(v.attributes), v]));
    const template = values.variants[0];
    const base = (slugify(values.title) || "SKU").toUpperCase().slice(0, 30);
    set(
      "variants",
      expandOptions(options).map((attributes) => {
        const found = existing.get(attrKey(attributes));
        if (found) return found;
        const suffix = Object.values(attributes)
          .map((v) => slugify(v).toUpperCase() || v.length.toString())
          .join("-");
        return {
          attributes,
          sku: suffix ? `${base}-${suffix}` : base,
          price: template?.price ?? "",
          compareAt: template?.compareAt ?? "",
          stock: "0",
          isActive: true,
        };
      }),
    );
  }

  function submit(intent: "draft" | "publish") {
    const input = {
      title: values.title,
      slug: values.slug.trim(),
      categoryId: values.categoryId,
      brandName: values.brandName,
      description: values.description,
      specs: values.specs,
      images: values.images,
      variants: values.variants.map((v) => ({
        id: v.id,
        attributes: v.attributes,
        sku: v.sku,
        priceMinor: parseMoney(v.price) ?? -1,
        compareAtMinor: v.compareAt.trim() ? (parseMoney(v.compareAt) ?? -1) : null,
        stock: /^\d+$/.test(v.stock.trim()) ? Number(v.stock) : -1,
        isActive: v.isActive,
      })),
      intent,
    };
    startTransition(async () => {
      const result = await saveProductAction(locale, values.id ?? null, input);
      setState(result);
      if (result.ok && result.id) {
        setValues((v) => ({ ...v, id: result.id, slug: result.slug ?? v.slug, status: result.status }));
        // New product: move to its edit page, which shows the "saved" message.
        if (!values.id) router.replace(`/seller/products/${result.id}?saved=1`);
      }
    });
  }

  const axisNames = Object.keys(values.variants[0]?.attributes ?? {});

  return (
    <form onSubmit={(e) => e.preventDefault()} className="space-y-8" noValidate>
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">{t("basics")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">{t("title")}</span>
            <input value={values.title} onChange={(e) => set("title", e.target.value)} maxLength={150} aria-invalid={!!fe("title")} className={inputClass} />
            {fe("title") && <span className="text-danger">{fe("title")}</span>}
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">{t("category")}</span>
            <select value={values.categoryId} onChange={(e) => set("categoryId", e.target.value)} aria-invalid={!!fe("categoryId")} className={inputClass}>
              <option value="">{t("chooseCategory")}</option>
              {[...new Set(categories.map((c) => c.group))].map((group) => (
                <optgroup key={group} label={group}>
                  {categories
                    .filter((c) => c.group === group)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
            {fe("categoryId") && <span className="text-danger">{fe("categoryId")}</span>}
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">{t("brand")}</span>
            <input value={values.brandName} onChange={(e) => set("brandName", e.target.value)} maxLength={60} className={inputClass} />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">{t("description")}</span>
            <textarea
              value={values.description}
              onChange={(e) => set("description", e.target.value)}
              rows={5}
              maxLength={5000}
              aria-invalid={!!fe("description")}
              className={inputClass}
            />
            {fe("description") && <span className="text-danger">{fe("description")}</span>}
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">{t("slug")}</span>
            <input value={values.slug} onChange={(e) => set("slug", e.target.value)} dir="ltr" maxLength={60} aria-invalid={!!fe("slug")} className={inputClass} />
            <span className="text-muted">{fe("slug") ?? t("slugHint")}</span>
          </label>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("images")}</h2>
        <ImageUploader images={values.images} onChange={(images) => set("images", images)} />
        {fe("images") && <p className="text-sm text-danger">{fe("images")}</p>}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">{t("variants")}</h2>
          <p className="text-sm text-muted">{t("variantsHint")}</p>
        </div>
        <div className="space-y-2">
          {values.options.map((option, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[10rem_1fr_auto]">
              <input
                aria-label={t("optionName")}
                placeholder={t("optionName")}
                value={option.name}
                onChange={(e) => set("options", values.options.map((o, j) => (j === i ? { ...o, name: e.target.value } : o)))}
                className={inputClass}
              />
              <input
                aria-label={t("optionValues")}
                placeholder={t("optionValues")}
                value={option.values}
                onChange={(e) => set("options", values.options.map((o, j) => (j === i ? { ...o, values: e.target.value } : o)))}
                className={inputClass}
              />
              <button type="button" onClick={() => set("options", values.options.filter((_, j) => j !== i))} className="text-sm text-muted underline">
                {t("removeOption")}
              </button>
            </div>
          ))}
          <div className="flex flex-wrap gap-3">
            {values.options.length < 3 && (
              <button type="button" onClick={() => set("options", [...values.options, { name: "", values: "" }])} className="text-sm text-brand underline">
                {t("addOption")}
              </button>
            )}
            <button type="button" onClick={generateVariants} className="rounded-md border border-brand px-3 py-1 text-sm font-medium text-brand">
              {t("generate")}
            </button>
          </div>
          <p className="text-xs text-muted">{t("generateHint")}</p>
        </div>
        {fe("variants") && <p className="text-sm text-danger">{fe("variants")}</p>}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="text-start text-muted">
                <th className="p-1 text-start font-medium">{t("variant")}</th>
                <th className="p-1 text-start font-medium">{t("sku")}</th>
                <th className="p-1 text-start font-medium">{t("price")}</th>
                <th className="p-1 text-start font-medium">{t("compareAt")}</th>
                <th className="p-1 text-start font-medium">{t("stock")}</th>
                <th className="p-1 text-start font-medium">{t("active")}</th>
              </tr>
            </thead>
            <tbody>
              {values.variants.map((v, i) => {
                const update = (patch: Partial<VariantRow>) => set("variants", values.variants.map((row, j) => (j === i ? { ...row, ...patch } : row)));
                return (
                  <tr key={attrKey(v.attributes)} className="border-t border-border align-top">
                    <td className="p-1">{axisNames.length ? axisNames.map((n) => v.attributes[n]).join(" · ") : t("single")}</td>
                    <td className="p-1">
                      <input aria-label={t("sku")} value={v.sku} onChange={(e) => update({ sku: e.target.value })} dir="ltr" aria-invalid={!!fe(`variants.${i}.sku`)} className={inputClass} />
                      {fe(`variants.${i}.sku`) && <span className="text-xs text-danger">{fe(`variants.${i}.sku`)}</span>}
                    </td>
                    <td className="p-1">
                      <input aria-label={t("price")} value={v.price} onChange={(e) => update({ price: e.target.value })} inputMode="decimal" dir="ltr" aria-invalid={!!fe(`variants.${i}.priceMinor`)} className={inputClass} />
                      {fe(`variants.${i}.priceMinor`) && <span className="text-xs text-danger">{fe(`variants.${i}.priceMinor`)}</span>}
                    </td>
                    <td className="p-1">
                      <input aria-label={t("compareAt")} value={v.compareAt} onChange={(e) => update({ compareAt: e.target.value })} inputMode="decimal" dir="ltr" aria-invalid={!!fe(`variants.${i}.compareAtMinor`)} className={inputClass} />
                      {fe(`variants.${i}.compareAtMinor`) && <span className="text-xs text-danger">{fe(`variants.${i}.compareAtMinor`)}</span>}
                    </td>
                    <td className="p-1">
                      <input aria-label={t("stock")} value={v.stock} onChange={(e) => update({ stock: e.target.value })} inputMode="numeric" dir="ltr" aria-invalid={!!fe(`variants.${i}.stock`)} className={`${inputClass} w-20`} />
                    </td>
                    <td className="p-1 text-center">
                      <input type="checkbox" aria-label={t("active")} checked={v.isActive} onChange={(e) => update({ isActive: e.target.checked })} className="size-4 accent-brand" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("specs")}</h2>
        {values.specs.map((spec, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[12rem_1fr_auto]">
            <input aria-label={t("specKey")} placeholder={t("specKey")} value={spec.key} onChange={(e) => set("specs", values.specs.map((s, j) => (j === i ? { ...s, key: e.target.value } : s)))} className={inputClass} />
            <input aria-label={t("specValue")} placeholder={t("specValue")} value={spec.value} onChange={(e) => set("specs", values.specs.map((s, j) => (j === i ? { ...s, value: e.target.value } : s)))} className={inputClass} />
            <button type="button" onClick={() => set("specs", values.specs.filter((_, j) => j !== i))} className="text-sm text-muted underline">
              {t("remove")}
            </button>
          </div>
        ))}
        {values.specs.length < 30 && (
          <button type="button" onClick={() => set("specs", [...values.specs, { key: "", value: "" }])} className="text-sm text-brand underline">
            {t("addSpec")}
          </button>
        )}
      </section>

      <div className="sticky bottom-0 -mx-4 space-y-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0">
        {state.fieldErrors && <p role="alert" className="text-sm text-danger">{t("fixErrors")}</p>}
        {state.error && (
          <p role="alert" className="text-sm text-danger">
            {err(state.error, state.errorValues)}
          </p>
        )}
        {state.ok && (
          <p role="status" className="text-sm text-brand">
            {t("saved")}{" "}
            {values.status === "ACTIVE" && values.slug && !shopPending && (
              <Link href={`/p/${values.slug}`} className="underline">
                {t("viewLive")}
              </Link>
            )}
          </p>
        )}
        {shopPending && <p className="text-xs text-muted">{t("pendingShopNote")}</p>}
        <div className="flex flex-wrap gap-3">
          <button type="button" disabled={pending} onClick={() => submit("publish")} className="rounded-md bg-brand px-5 py-2.5 font-semibold text-brand-foreground disabled:opacity-60">
            {pending ? t("saving") : t("publish")}
          </button>
          <button type="button" disabled={pending} onClick={() => submit("draft")} className="rounded-md border border-border px-5 py-2.5 font-medium disabled:opacity-60">
            {t("saveDraft")}
          </button>
        </div>
      </div>
    </form>
  );
}

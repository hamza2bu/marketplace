"use client";

import { useRef, useState } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";

type Option = { value: string; label: string; count: number };

export type FilterPanelProps = {
  action: string; // locale-less path, e.g. "/search"
  hidden: Record<string, string>; // carried over: q, sort
  groups: { name: string; title: string; options: Option[]; selected: string[] }[];
  price: { min?: number; max?: number; placeholderMin?: number; placeholderMax?: number };
  rating?: number;
  inStock: boolean;
  deals: boolean;
  showDeals: boolean;
  activeCount: number;
  labels: {
    filters: string;
    filtersCount: string;
    apply: string;
    price: string;
    minPrice: string;
    maxPrice: string;
    rating: string;
    ratingAndUp: Record<number, string>;
    availability: string;
    inStockOnly: string;
    dealsOnly: string;
  };
};

/**
 * Plain GET form, so filtering works without JavaScript. With JavaScript,
 * checkbox and radio changes submit right away.
 */
export function FilterPanel(props: FilterPanelProps) {
  const locale = useLocale();
  const form = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { labels } = props;
  const submit = () => form.current?.requestSubmit();

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="catalog-filters"
        onClick={() => setOpen((o) => !o)}
        className="w-full rounded-md border border-border px-3 py-2 text-sm font-medium lg:hidden"
      >
        {props.activeCount > 0 ? labels.filtersCount : labels.filters}
      </button>

      <form
        id="catalog-filters"
        ref={form}
        action={`/${locale}${props.action}`}
        className={`${open ? "block" : "hidden"} mt-3 space-y-6 lg:mt-0 lg:block`}
        onSubmit={(e) => {
          // Client-side navigation, and drop empty fields from the URL.
          e.preventDefault();
          const params = new URLSearchParams();
          for (const [name, value] of new FormData(e.currentTarget)) {
            if (typeof value === "string" && value.trim()) params.append(name, value.trim());
          }
          const qs = params.toString();
          router.push(qs ? `${props.action}?${qs}` : props.action, { scroll: false });
        }}
      >
        <h2 className="hidden text-lg font-semibold lg:block">{labels.filters}</h2>
        {Object.entries(props.hidden).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}

        {props.groups
          .filter((g) => g.options.length > 0)
          .map((group) => (
            <fieldset key={group.name} className="space-y-2">
              <legend className="mb-2 text-sm font-semibold">{group.title}</legend>
              {group.options.map((o) => (
                <label key={o.value} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name={group.name}
                    value={o.value}
                    defaultChecked={group.selected.includes(o.value)}
                    onChange={submit}
                    className="size-4 accent-brand"
                  />
                  <span className="flex-1">{o.label}</span>
                  <span className="text-xs text-muted">{o.count}</span>
                </label>
              ))}
            </fieldset>
          ))}

        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-semibold">{labels.price}</legend>
          <div className="flex items-center gap-2">
            <input
              type="number"
              name="min"
              min={0}
              inputMode="numeric"
              aria-label={labels.minPrice}
              placeholder={props.price.placeholderMin !== undefined ? String(props.price.placeholderMin) : labels.minPrice}
              defaultValue={props.price.min}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-base"
            />
            <span aria-hidden>–</span>
            <input
              type="number"
              name="max"
              min={0}
              inputMode="numeric"
              aria-label={labels.maxPrice}
              placeholder={props.price.placeholderMax !== undefined ? String(props.price.placeholderMax) : labels.maxPrice}
              defaultValue={props.price.max}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-base"
            />
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-semibold">{labels.rating}</legend>
          {[4, 3, 2, 1].map((stars) => (
            <label key={stars} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="rating"
                value={stars}
                defaultChecked={props.rating === stars}
                onChange={submit}
                className="size-4 accent-brand"
              />
              {labels.ratingAndUp[stars]}
            </label>
          ))}
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-semibold">{labels.availability}</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="stock" value="1" defaultChecked={props.inStock} onChange={submit} className="size-4 accent-brand" />
            {labels.inStockOnly}
          </label>
          {props.showDeals && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="deals" value="1" defaultChecked={props.deals} onChange={submit} className="size-4 accent-brand" />
              {labels.dealsOnly}
            </label>
          )}
        </fieldset>

        <button type="submit" className="w-full rounded-md bg-brand px-4 py-2 text-sm font-medium text-brand-foreground">
          {labels.apply}
        </button>
      </form>
    </div>
  );
}

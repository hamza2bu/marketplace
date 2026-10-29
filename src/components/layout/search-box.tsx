"use client";

import { useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";

type Props = { placeholder: string; label: string; defaultValue?: string };

export function SearchBoxFallback({ placeholder, label, defaultValue }: Props) {
  const locale = useLocale();
  return (
    <form role="search" action={`/${locale}/search`} className="flex">
      <input
        type="search"
        name="q"
        defaultValue={defaultValue}
        placeholder={placeholder}
        aria-label={placeholder}
        maxLength={100}
        className="min-w-0 flex-1 rounded-s-md border border-border bg-surface px-3 py-2 text-base outline-none focus:border-brand"
      />
      <button type="submit" className="rounded-e-md bg-brand px-4 font-medium text-brand-foreground">
        {label}
      </button>
    </form>
  );
}

/** Header search; pre-fills the current query on the search page. */
export function SearchBox(props: Props) {
  const q = useSearchParams().get("q") ?? "";
  return <SearchBoxFallback {...props} key={q} defaultValue={q} />;
}

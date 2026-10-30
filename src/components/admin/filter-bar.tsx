import { Link } from "@/i18n/navigation";

/** Status tabs plus an optional search box, as plain links and a GET form. */
export function FilterBar({
  basePath,
  locale,
  tabs,
  current,
  q,
  searchLabel,
  allLabel,
}: {
  basePath: string;
  locale: string;
  tabs: { value: string; label: string }[];
  current?: string;
  q?: string;
  searchLabel?: string;
  allLabel: string;
}) {
  const href = (status?: string) => {
    const sp = new URLSearchParams();
    if (status) sp.set("status", status);
    if (q) sp.set("q", q);
    const qs = sp.toString();
    return `${basePath}${qs ? `?${qs}` : ""}`;
  };
  const tab = (active: boolean) => `rounded-full px-3 py-1 text-sm whitespace-nowrap ${active ? "bg-brand text-brand-foreground" : "bg-surface hover:bg-border"}`;
  return (
    <div className="space-y-3">
      {searchLabel && (
        <form action={`/${locale}${basePath}`} className="flex gap-2">
          {current && <input type="hidden" name="status" value={current} />}
          <input type="search" name="q" defaultValue={q} placeholder={searchLabel} aria-label={searchLabel} className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2" />
          <button className="rounded-md border border-border px-3 py-2 text-sm">⌕</button>
        </form>
      )}
      <nav className="flex gap-2 overflow-x-auto pb-1">
        <Link href={href()} className={tab(!current)}>
          {allLabel}
        </Link>
        {tabs.map((t) => (
          <Link key={t.value} href={href(t.value)} className={tab(current === t.value)}>
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

/** Reads ?status= (one of `allowed`), ?q= and ?page= from search params. */
export function readListParams<T extends string>(sp: Record<string, string | string[] | undefined>, allowed: readonly T[]) {
  const status = allowed.find((s) => s === sp.status);
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const page = Number(sp.page);
  return { status, q, page: Number.isInteger(page) && page > 0 ? page : 1 };
}

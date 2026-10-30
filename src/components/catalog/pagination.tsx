import { Link } from "@/i18n/navigation";

export function Pagination({
  page,
  pageCount,
  hrefFor,
  labels,
}: {
  page: number;
  pageCount: number;
  hrefFor: (page: number) => string;
  labels: { pagination: string; previous: string; next: string; pageOf: string };
}) {
  if (pageCount <= 1) return null;
  const linkClass = "rounded-md border border-border px-3 py-1.5 hover:bg-surface";
  return (
    <nav aria-label={labels.pagination} className="flex items-center justify-center gap-3 text-sm">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} rel="prev" className={linkClass}>
          {labels.previous}
        </Link>
      ) : (
        <span className={`${linkClass} opacity-40`}>{labels.previous}</span>
      )}
      <span className="text-muted">{labels.pageOf}</span>
      {page < pageCount ? (
        <Link href={hrefFor(page + 1)} rel="next" className={linkClass}>
          {labels.next}
        </Link>
      ) : (
        <span className={`${linkClass} opacity-40`}>{labels.next}</span>
      )}
    </nav>
  );
}

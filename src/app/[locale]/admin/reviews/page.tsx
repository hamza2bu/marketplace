import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ActionForm } from "@/components/admin/action-form";
import { FilterBar, readListParams } from "@/components/admin/filter-bar";
import { Pagination } from "@/components/catalog/pagination";
import { Stars } from "@/components/catalog/stars";
import { requireAdmin } from "@/server/auth/guards";
import { listReviewsForAdmin } from "@/server/admin/catalog";
import type { ReviewStatus } from "@/generated/prisma/enums";
import { moderateReviewAction } from "../actions";

export const metadata: Metadata = { robots: { index: false } };
const STATUSES: ReviewStatus[] = ["FLAGGED", "VISIBLE", "HIDDEN"];

export default async function AdminReviewsPage({ params, searchParams }: PageProps<"/[locale]/admin/reviews">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin(locale);
  const { status, page } = readListParams(await searchParams, STATUSES);
  const [t, common, productT, catalogT, { reviews, pageCount }] = await Promise.all([
    getTranslations("admin.reviews"),
    getTranslations("admin.common"),
    getTranslations("product"),
    getTranslations("catalog"),
    listReviewsForAdmin({ status, page }),
  ]);
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <FilterBar basePath="/admin/reviews" locale={locale} tabs={STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) }))} current={status} allLabel={common("all")} />
      {reviews.length === 0 ? (
        <p className="py-8 text-center text-muted">{common("none")}</p>
      ) : (
        <ul className="space-y-3">
          {reviews.map((r) => (
            <li key={r.id} className="space-y-2 rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <Link href={`/p/${r.product.slug}`} prefetch={false} className="font-medium hover:text-brand">
                  {r.product.title}
                </Link>
                <span className="rounded-full bg-surface px-2 py-0.5 text-xs">{t(`status.${r.status}`)}</span>
              </div>
              <Stars rating={r.rating} label={productT("starsOutOf", { rating: r.rating })} />
              {r.title && <p className="font-semibold">{r.title}</p>}
              <p className="text-sm">{r.body}</p>
              <p className="text-xs text-muted">
                {t("by", { email: r.user.email })} · {dateFmt.format(r.createdAt)}
              </p>
              <ActionForm action={moderateReviewAction} errors="admin.common" className="flex flex-wrap gap-2 text-sm">
                <input type="hidden" name="reviewId" value={r.id} />
                {r.status !== "VISIBLE" && (
                  <button name="decision" value="show" className="rounded-md border border-border px-3 py-1">
                    {t("show")}
                  </button>
                )}
                {r.status !== "HIDDEN" && (
                  <button name="decision" value="hide" className="rounded-md border border-border px-3 py-1">
                    {t("hide")}
                  </button>
                )}
                <button name="decision" value="delete" className="rounded-md border border-danger px-3 py-1 text-danger">
                  {common("delete")}
                </button>
              </ActionForm>
            </li>
          ))}
        </ul>
      )}
      <Pagination
        page={page}
        pageCount={pageCount}
        hrefFor={(n) => `/admin/reviews?${new URLSearchParams({ ...(status ? { status } : {}), page: String(n) })}`}
        labels={{ pagination: catalogT("pagination"), previous: catalogT("previous"), next: catalogT("next"), pageOf: catalogT("pageOf", { page, pageCount }) }}
      />
    </div>
  );
}

import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ActionForm } from "@/components/admin/action-form";
import { FilterBar, readListParams } from "@/components/admin/filter-bar";
import { Pagination } from "@/components/catalog/pagination";
import { ProductImage } from "@/components/catalog/product-image";
import { formatMoney } from "@/lib/money";
import { requireAdmin } from "@/server/auth/guards";
import { listProductsForAdmin } from "@/server/admin/catalog";
import type { ProductStatus } from "@/generated/prisma/enums";
import { moderateProductAction } from "../actions";

export const metadata: Metadata = { robots: { index: false } };
const STATUSES: ProductStatus[] = ["PENDING_REVIEW", "ACTIVE", "REJECTED", "DRAFT", "ARCHIVED"];

export default async function AdminProductsPage({ params, searchParams }: PageProps<"/[locale]/admin/products">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin(locale);
  const { status, q, page } = readListParams(await searchParams, STATUSES);
  const [t, common, statusT, sellerT, catalogT, { products, pageCount }] = await Promise.all([
    getTranslations("admin.products"),
    getTranslations("admin.common"),
    getTranslations("seller.products.status"),
    getTranslations("seller.products"),
    getTranslations("catalog"),
    listProductsForAdmin({ status, q, page }),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <FilterBar basePath="/admin/products" locale={locale} tabs={STATUSES.map((s) => ({ value: s, label: statusT(s) }))} current={status} q={q} searchLabel={t("search")} allLabel={common("all")} />
      {products.length === 0 ? (
        <p className="py-8 text-center text-muted">{common("none")}</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {products.map((p) => (
            <li key={p.id} className="flex flex-wrap items-start gap-3 p-3">
              <div className="relative size-14 shrink-0 overflow-hidden rounded bg-surface">
                {p.images[0] && <ProductImage src={p.images[0].url} alt="" fill sizes="56px" className="object-cover" />}
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="font-medium">
                  {p.status === "ACTIVE" && p.shop.status === "APPROVED" ? (
                    <Link href={`/p/${p.slug}`} prefetch={false} className="hover:text-brand">
                      {p.title}
                    </Link>
                  ) : (
                    p.title
                  )}
                </p>
                <p className="text-xs text-muted">
                  {p.shop.name} · {formatMoney(p.minPriceMinor, locale)} · <span className="text-foreground">{statusT(p.status)}</span>
                  {p.isFeatured && <span className="ms-1 rounded bg-brand/10 px-1 text-brand">{t("featured")}</span>}
                </p>
                {p.moderationNote && <p className="text-xs text-danger">{sellerT("adminNote", { note: p.moderationNote })}</p>}
              </div>
              <div className="flex flex-wrap items-start gap-2 text-sm">
                {(p.status === "PENDING_REVIEW" || p.status === "REJECTED") && (
                  <ActionForm action={moderateProductAction} errors="admin.common">
                    <input type="hidden" name="productId" value={p.id} />
                    <button name="decision" value="approve" className="rounded-md bg-brand px-3 py-1.5 font-medium text-brand-foreground">
                      {t("approve")}
                    </button>
                  </ActionForm>
                )}
                {p.status === "ACTIVE" && (
                  <ActionForm action={moderateProductAction} errors="admin.common">
                    <input type="hidden" name="productId" value={p.id} />
                    <button name="decision" value={p.isFeatured ? "unfeature" : "feature"} className="rounded-md border border-border px-3 py-1.5">
                      {p.isFeatured ? t("unfeature") : t("feature")}
                    </button>
                  </ActionForm>
                )}
                {p.status !== "REJECTED" && p.status !== "ARCHIVED" && (
                  <details>
                    <summary className="cursor-pointer rounded-md border border-danger px-3 py-1.5 text-danger">{t("reject")}</summary>
                    <ActionForm action={moderateProductAction} errors="admin.common" className="mt-2 w-64 space-y-2">
                      <input type="hidden" name="productId" value={p.id} />
                      <textarea name="note" required minLength={3} rows={2} placeholder={t("rejectNote")} aria-label={t("rejectNote")} className="w-full rounded-md border border-border bg-background p-2" />
                      <button name="decision" value="reject" className="rounded-md bg-danger px-3 py-1.5 font-medium text-white">
                        {t("reject")}
                      </button>
                    </ActionForm>
                  </details>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Pagination
        page={page}
        pageCount={pageCount}
        hrefFor={(n) => `/admin/products?${new URLSearchParams({ ...(status ? { status } : {}), ...(q ? { q } : {}), page: String(n) })}`}
        labels={{ pagination: catalogT("pagination"), previous: catalogT("previous"), next: catalogT("next"), pageOf: catalogT("pageOf", { page, pageCount }) }}
      />
    </div>
  );
}

import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Pagination } from "@/components/catalog/pagination";
import { ProductImage } from "@/components/catalog/product-image";
import { ConfirmButton } from "@/components/seller/confirm-button";
import { localized } from "@/lib/i18n-text";
import { formatMoney } from "@/lib/money";
import { requireSeller } from "@/server/auth/guards";
import { getSellerProducts } from "@/server/seller/products";
import type { ProductStatus } from "@/generated/prisma/enums";
import { productLifecycleAction } from "./actions";

export const metadata: Metadata = { robots: { index: false } };

const STATUSES: ProductStatus[] = ["ACTIVE", "DRAFT", "PENDING_REVIEW", "REJECTED", "ARCHIVED"];

export default async function SellerProductsPage({ params, searchParams }: PageProps<"/[locale]/seller/products">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { shop } = await requireSeller(locale);
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const status = STATUSES.find((s) => s === sp.status);
  const pageNum = Number(sp.page);
  const page = Number.isInteger(pageNum) && pageNum > 0 ? pageNum : 1;

  const [t, catalogT, { products, pageCount }] = await Promise.all([
    getTranslations("seller.products"),
    getTranslations("catalog"),
    getSellerProducts(shop.id, { q, status, page }),
  ]);
  const query = (p: number) => {
    const s = new URLSearchParams();
    if (q) s.set("q", q);
    if (status) s.set("status", status);
    if (p > 1) s.set("page", String(p));
    const qs = s.toString();
    return `/seller/products${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <div className="flex gap-2">
          <Link href="/seller/products/import" className="rounded-md border border-border px-3 py-2 text-sm font-medium">
            {t("import")}
          </Link>
          <Link href="/seller/products/new" className="rounded-md bg-brand px-3 py-2 text-sm font-semibold text-brand-foreground">
            {t("new")}
          </Link>
        </div>
      </div>

      <form className="flex flex-wrap gap-2" action={`/${locale}/seller/products`}>
        <input type="search" name="q" defaultValue={q} placeholder={t("search")} aria-label={t("search")} className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2" />
        <select name="status" defaultValue={status ?? ""} aria-label={t("colStatus")} className="rounded-md border border-border bg-background px-2 py-2">
          <option value="">{t("all")}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`status.${s}`)}
            </option>
          ))}
        </select>
        <button className="rounded-md border border-border px-3 py-2">{catalogT("apply")}</button>
      </form>

      {products.length === 0 ? (
        <p className="py-8 text-center text-muted">{t("empty")}</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {products.map((p) => {
            const stock = p.variants.reduce((n, v) => n + v.stock, 0);
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-3 p-3">
                <div className="relative size-14 shrink-0 overflow-hidden rounded bg-surface">
                  {p.images[0] && <ProductImage src={p.images[0].url} alt="" fill sizes="56px" className="object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <Link href={`/seller/products/${p.id}`} className="line-clamp-1 font-medium hover:text-brand">
                    {p.title}
                  </Link>
                  <p className="text-xs text-muted">{localized(p.category.name, locale)}</p>
                  {p.moderationNote && p.status === "REJECTED" && <p className="text-xs text-danger">{t("adminNote", { note: p.moderationNote })}</p>}
                </div>
                <div className="text-sm">
                  <span className="font-semibold">{formatMoney(p.minPriceMinor, locale)}</span>
                  {p.hasDeal && <span className="ms-1 rounded bg-danger/10 px-1 text-xs text-danger">{t("onSale")}</span>}
                </div>
                <div className={`w-16 text-sm ${stock === 0 ? "font-semibold text-danger" : ""}`}>
                  {t("colStock")}: {stock}
                </div>
                <span className="rounded-full bg-surface px-2 py-0.5 text-xs">{t(`status.${p.status}`)}</span>
                <div className="flex gap-3 text-sm">
                  <Link href={`/seller/products/${p.id}`} className="text-brand underline">
                    {t("edit")}
                  </Link>
                  <form action={productLifecycleAction}>
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="productId" value={p.id} />
                    {p.status === "ARCHIVED" ? (
                      <button name="action" value="restore" className="underline">
                        {t("restore")}
                      </button>
                    ) : (
                      <span className="flex gap-3">
                        <button name="action" value="archive" className="text-muted underline">
                          {t("archive")}
                        </button>
                        <ConfirmButton name="action" value="delete" message={t("deleteConfirm")} className="text-danger underline">
                          {t("delete")}
                        </ConfirmButton>
                      </span>
                    )}
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Pagination
        page={page}
        pageCount={pageCount}
        hrefFor={query}
        labels={{ pagination: catalogT("pagination"), previous: catalogT("previous"), next: catalogT("next"), pageOf: catalogT("pageOf", { page, pageCount }) }}
      />
    </div>
  );
}

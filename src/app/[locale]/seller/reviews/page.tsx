import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Pagination } from "@/components/catalog/pagination";
import { Stars } from "@/components/catalog/stars";
import { requireSeller } from "@/server/auth/guards";
import { db } from "@/server/db";
import { getShopReviews } from "@/server/reviews";
import { ReviewReplyForm } from "../orders/order-actions";

export const metadata: Metadata = { robots: { index: false } };

export default async function SellerReviewsPage({ params, searchParams }: PageProps<"/[locale]/seller/reviews">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { shop } = await requireSeller(locale);
  const pageNum = Number((await searchParams).page);
  const page = Number.isInteger(pageNum) && pageNum > 0 ? pageNum : 1;
  const [t, productT, catalogT, { reviews, total, pageCount }, rating] = await Promise.all([
    getTranslations("seller.reviews"),
    getTranslations("product"),
    getTranslations("catalog"),
    getShopReviews(shop.id, page),
    db.shop.findUniqueOrThrow({ where: { id: shop.id }, select: { ratingAvg: true } }),
  ]);
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      {total > 0 && <p className="text-sm text-muted">{t("average", { rating: rating.ratingAvg.toFixed(1), count: total })}</p>}
      {reviews.length === 0 ? (
        <p className="py-8 text-center text-muted">{t("empty")}</p>
      ) : (
        <ul className="space-y-3">
          {reviews.map((r) => (
            <li key={r.id} className="space-y-2 rounded-lg border border-border p-4">
              <Link href={`/p/${r.product.slug}`} prefetch={false} className="text-sm font-medium hover:text-brand">
                {r.product.title}
              </Link>
              <Stars rating={r.rating} label={productT("starsOutOf", { rating: r.rating })} />
              {r.title && <p className="font-semibold">{r.title}</p>}
              <p className="text-sm">{r.body}</p>
              <p className="text-xs text-muted">
                {r.user.name?.split(" ")[0]} · {dateFmt.format(r.createdAt)}
              </p>
              <ReviewReplyForm reviewId={r.id} reply={r.sellerReply} />
            </li>
          ))}
        </ul>
      )}
      <Pagination
        page={page}
        pageCount={pageCount}
        hrefFor={(n) => `/seller/reviews?page=${n}`}
        labels={{ pagination: catalogT("pagination"), previous: catalogT("previous"), next: catalogT("next"), pageOf: catalogT("pageOf", { page, pageCount }) }}
      />
    </div>
  );
}

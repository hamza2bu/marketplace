"use client";

import { useActionState } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { flagReviewAction, type ReviewState } from "@/app/[locale]/account/actions";

/** "Report" under a review. Product pages are cached, so sign-in state comes from the browser. */
export function ReportReview({ reviewId }: { reviewId: string }) {
  const t = useTranslations("reviews");
  const errors = useTranslations("reviews.errors");
  const { status } = useSession();
  const pathname = usePathname();
  const [state, action, pending] = useActionState<ReviewState, FormData>(flagReviewAction, {});

  if (state.ok) return <p role="status" className="text-xs text-muted">{t("reported")}</p>;
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-muted underline">{t("report")}</summary>
      {status === "authenticated" ? (
        <form action={action} className="mt-1 flex flex-wrap gap-2">
          <input type="hidden" name="reviewId" value={reviewId} />
          <input name="reason" required minLength={3} maxLength={300} placeholder={t("reportReason")} aria-label={t("reportReason")} className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 text-sm" />
          <button disabled={pending} className="rounded border border-border px-2 py-1">
            {t("report")}
          </button>
          {state.error && <span className="w-full text-danger">{errors.has(state.error as "own") ? errors(state.error as "own") : errors("invalid")}</span>}
        </form>
      ) : (
        <Link href={`/sign-in?callbackUrl=${encodeURIComponent(pathname)}`} className="mt-1 inline-block text-brand underline">
          {t("signInToReport")}
        </Link>
      )}
    </details>
  );
}

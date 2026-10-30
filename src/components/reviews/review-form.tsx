"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { deleteReviewAction, saveReviewAction, type ReviewState } from "@/app/[locale]/account/actions";

type Existing = { id: string; rating: number; title: string | null; body: string } | null;

function StarInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const t = useTranslations("reviews");
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium">{t("rating")}</legend>
      <div className="flex gap-1" dir="ltr">
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="cursor-pointer text-3xl leading-none">
            <input type="radio" name="rating" value={n} checked={value === n} onChange={() => onChange(n)} className="peer sr-only" />
            <span aria-hidden className={`${n <= value ? "text-amber-500" : "text-border"} peer-focus-visible:outline-2 peer-focus-visible:outline-brand`}>
              ★
            </span>
            <span className="sr-only">{t("stars", { count: n })}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Write or edit a review for one delivered order item. */
export function ReviewForm({ orderItemId, existing }: { orderItemId: string; existing: Existing }) {
  const t = useTranslations("reviews");
  const errors = useTranslations("reviews.errors");
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [state, action, pending] = useActionState<ReviewState, FormData>(saveReviewAction, {});
  const [delState, del, deleting] = useActionState<ReviewState, FormData>(deleteReviewAction, {});
  const error = state.error ?? delState.error;

  return (
    <details className="text-sm" open={state.ok ? false : undefined}>
      <summary className="cursor-pointer font-medium text-brand">{existing ? t("edit") : t("write")}</summary>
      <form action={action} className="mt-2 space-y-2">
        <input type="hidden" name="orderItemId" value={orderItemId} />
        <StarInput value={rating} onChange={setRating} />
        <label className="block">
          <span className="mb-1 block">{t("title")}</span>
          <input name="title" maxLength={120} defaultValue={existing?.title ?? ""} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-base" />
        </label>
        <label className="block">
          <span className="mb-1 block">{t("body")}</span>
          <textarea name="body" required minLength={10} maxLength={3000} rows={3} defaultValue={existing?.body ?? ""} className="w-full rounded-md border border-border bg-background p-2 text-base" />
        </label>
        {error && (
          <p role="alert" className="text-danger">
            {errors.has(error as "invalid") ? errors(error as "invalid") : errors("invalid")}
          </p>
        )}
        <div className="flex gap-3">
          <button disabled={pending || rating === 0} className="rounded-md bg-brand px-3 py-1.5 font-medium text-brand-foreground disabled:opacity-50">
            {t("submit")}
          </button>
        </div>
      </form>
      {existing && (
        <form action={del} className="mt-2">
          <input type="hidden" name="reviewId" value={existing.id} />
          <button disabled={deleting} className="text-danger underline">
            {t("delete")}
          </button>
        </form>
      )}
    </details>
  );
}

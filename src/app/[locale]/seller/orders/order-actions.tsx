"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useErrorText } from "@/components/ui/use-error-text";
import { CARRIERS } from "@/lib/validation/seller";
import { advanceOrderAction, cancelOrderAction, disputeReplyAction, returnDecisionAction, reviewReplyAction, type SellerOrderState } from "./actions";

const input = "w-full rounded-md border border-border bg-background px-2 py-1.5 text-base";

function Feedback({ state }: { state: SellerOrderState }) {
  const err = useErrorText();
  return state.error ? (
    <p role="alert" className="text-sm text-danger">
      {err(state.error)}
    </p>
  ) : null;
}

/** The next fulfilment step for a sub-order. */
export function AdvanceForm({ subOrderId, status }: { subOrderId: string; status: string }) {
  const t = useTranslations("seller.orders");
  const carriers = useTranslations("seller.carriers");
  const locale = useLocale();
  const err = useErrorText();
  const [state, action, pending] = useActionState<SellerOrderState, FormData>(advanceOrderAction, {});
  const next = status === "PAID" ? "PROCESSING" : status === "PROCESSING" ? "SHIPPED" : status === "SHIPPED" ? "DELIVERED" : null;
  if (!next) return null;

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="subOrderId" value={subOrderId} />
      <input type="hidden" name="to" value={next} />
      {next === "SHIPPED" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium">{t("carrier")}</span>
            <select name="carrier" className={input}>
              {CARRIERS.map((c) => (
                <option key={c} value={c}>
                  {carriers(c)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">{t("trackingNumber")}</span>
            <input name="trackingNumber" dir="ltr" required className={input} />
            {state.fieldErrors?.trackingNumber && <span className="text-danger">{err(state.fieldErrors.trackingNumber)}</span>}
          </label>
        </div>
      )}
      <button disabled={pending} className="rounded-md bg-brand px-4 py-2 font-semibold text-brand-foreground disabled:opacity-60">
        {next === "PROCESSING" ? t("markProcessing") : next === "SHIPPED" ? t("markShipped") : t("markDelivered")}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function SellerCancelForm({ subOrderId }: { subOrderId: string }) {
  const t = useTranslations("seller.orders");
  const locale = useLocale();
  const err = useErrorText();
  const [state, action, pending] = useActionState<SellerOrderState, FormData>(cancelOrderAction, {});
  return (
    <details className="rounded-md border border-border p-3">
      <summary className="cursor-pointer text-sm font-medium text-danger">{t("cancel")}</summary>
      <form
        action={action}
        onSubmit={(e) => {
          if (!window.confirm(t("cancelConfirm"))) e.preventDefault();
        }}
        className="mt-3 space-y-2"
      >
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="subOrderId" value={subOrderId} />
        <label className="block text-sm">
          <span className="mb-1 block">{t("cancelReason")}</span>
          <input name="reason" required minLength={3} maxLength={300} className={input} />
          {state.fieldErrors?.reason && <span className="text-danger">{err(state.fieldErrors.reason)}</span>}
        </label>
        <button disabled={pending} className="rounded-md border border-danger px-3 py-1.5 text-sm font-medium text-danger disabled:opacity-60">
          {t("cancel")}
        </button>
        <Feedback state={state} />
      </form>
    </details>
  );
}

export function DisputeReplyForm({ disputeId }: { disputeId: string }) {
  const t = useTranslations("seller.orders");
  const locale = useLocale();
  const err = useErrorText();
  const [state, action, pending] = useActionState<SellerOrderState, FormData>(disputeReplyAction, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="disputeId" value={disputeId} />
      <textarea name="message" required rows={2} aria-label={t("reply")} className={input} />
      {state.fieldErrors?.message && <span className="text-sm text-danger">{err(state.fieldErrors.message)}</span>}
      <button disabled={pending} className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-60">
        {t("reply")}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function ReturnDecision({ returnId, status, maxLabel }: { returnId: string; status: string; maxLabel: string }) {
  const t = useTranslations("seller.returns");
  const locale = useLocale();
  const err = useErrorText();
  const [state, action, pending] = useActionState<SellerOrderState, FormData>(returnDecisionAction, {});
  const hidden = (
    <>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="returnId" value={returnId} />
    </>
  );

  return (
    <div className="space-y-3">
      {status === "REQUESTED" && (
        <div className="flex flex-wrap items-start gap-3">
          <form action={action}>
            {hidden}
            <button name="decision" value="approve" disabled={pending} className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-brand-foreground disabled:opacity-60">
              {t("approve")}
            </button>
          </form>
          <details className="flex-1">
            <summary className="cursor-pointer text-sm text-danger">{t("reject")}</summary>
            <form action={action} className="mt-2 space-y-2">
              {hidden}
              <input name="note" placeholder={t("rejectNote")} aria-label={t("rejectNote")} required className={input} />
              {state.fieldErrors?.note && <span className="text-sm text-danger">{err(state.fieldErrors.note)}</span>}
              <button name="decision" value="reject" disabled={pending} className="rounded-md border border-danger px-3 py-1.5 text-sm text-danger">
                {t("reject")}
              </button>
            </form>
          </details>
        </div>
      )}
      {(status === "REQUESTED" || status === "APPROVED") && (
        <form action={action} className="space-y-2 rounded-md bg-surface p-3">
          {hidden}
          <p className="text-sm font-medium">{t("refundTitle")}</p>
          <label className="block text-sm">
            <span className="mb-1 block">{t("amount", { max: maxLabel })}</span>
            <input name="amount" inputMode="decimal" dir="ltr" className={`${input} max-w-40`} />
            {state.fieldErrors?.amount && <span className="text-danger">{err(state.fieldErrors.amount)}</span>}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="restock" defaultChecked className="size-4 accent-brand" />
            {t("restock")}
          </label>
          <button name="decision" value="refund" disabled={pending} className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-brand-foreground disabled:opacity-60">
            {t("refund")}
          </button>
        </form>
      )}
      <Feedback state={state} />
    </div>
  );
}

export function ReviewReplyForm({ reviewId, reply }: { reviewId: string; reply: string | null }) {
  const t = useTranslations("seller.reviews");
  const settings = useTranslations("seller.settings");
  const locale = useLocale();
  const [state, action, pending] = useActionState<SellerOrderState, FormData>(reviewReplyAction, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="reviewId" value={reviewId} />
      <label className="block text-sm">
        <span className="mb-1 block font-medium">{t("reply")}</span>
        <textarea name="reply" rows={2} maxLength={1000} defaultValue={reply ?? ""} className={input} />
      </label>
      <button disabled={pending} className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-60">
        {t("saveReply")}
      </button>
      {state.ok && <span role="status" className="ms-2 text-sm text-brand">{settings("saved")}</span>}
      <Feedback state={state} />
    </form>
  );
}

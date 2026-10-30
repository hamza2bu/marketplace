"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { cancelPendingOrderAction, cancelSubOrderAction, openDisputeAction, requestReturnAction, type OrderActionState } from "./actions";

function ErrorText({ state }: { state: OrderActionState }) {
  const t = useTranslations("orders.actionError");
  return state.error ? (
    <p role="alert" className="text-sm text-danger">
      {t(state.error)}
    </p>
  ) : null;
}

export function CancelPendingOrderButton({ orderId }: { orderId: string }) {
  const t = useTranslations("orders");
  const locale = useLocale();
  const [state, action, pending] = useActionState(cancelPendingOrderAction, {});
  return (
    <form action={action} className="space-y-1">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="orderId" value={orderId} />
      <button disabled={pending} className="rounded-md border border-border px-3 py-1.5 text-sm hover:border-danger hover:text-danger disabled:opacity-50">
        {t("cancelPending")}
      </button>
      <ErrorText state={state} />
    </form>
  );
}

export function CancelSubOrderButton({ subOrderId }: { subOrderId: string }) {
  const t = useTranslations("orders");
  const locale = useLocale();
  const [state, action, pending] = useActionState(cancelSubOrderAction, {});
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(t("cancelConfirm"))) e.preventDefault();
      }}
      className="space-y-1"
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="subOrderId" value={subOrderId} />
      <button disabled={pending} className="rounded-md border border-border px-3 py-1.5 text-sm hover:border-danger hover:text-danger disabled:opacity-50">
        {t("cancelShipment")}
      </button>
      <ErrorText state={state} />
    </form>
  );
}

export function ReportProblemForm({ subOrderId }: { subOrderId: string }) {
  const t = useTranslations("orders");
  const locale = useLocale();
  const [state, action, pending] = useActionState(openDisputeAction, {});
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-muted underline">{t("reportProblem")}</summary>
      <form action={action} className="mt-2 space-y-2">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="subOrderId" value={subOrderId} />
        <label className="block">
          <span className="mb-1 block text-muted">{t("problemHint")}</span>
          <textarea name="reason" required minLength={5} maxLength={1000} rows={3} className="w-full rounded-md border border-border bg-background p-2 text-base" />
        </label>
        <ErrorText state={state} />
        <button disabled={pending} className="rounded-md border border-border px-3 py-1.5 font-medium disabled:opacity-50">
          {t("sendProblem")}
        </button>
      </form>
    </details>
  );
}

export function ReturnRequestForm({ subOrderId }: { subOrderId: string }) {
  const t = useTranslations("orders");
  const locale = useLocale();
  const [state, action, pending] = useActionState(requestReturnAction, {});
  return (
    <details className="rounded-md border border-border p-3">
      <summary className="cursor-pointer text-sm font-medium">{t("requestReturn")}</summary>
      <form action={action} className="mt-3 space-y-2">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="subOrderId" value={subOrderId} />
        <label className="block text-sm">
          <span className="mb-1 block">{t("returnReason")}</span>
          <textarea name="reason" required minLength={5} maxLength={1000} rows={3} className="w-full rounded-md border border-border bg-background p-2 text-base" />
        </label>
        <ErrorText state={state} />
        <button disabled={pending} className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-brand-foreground disabled:opacity-50">
          {t("submitReturn")}
        </button>
      </form>
    </details>
  );
}

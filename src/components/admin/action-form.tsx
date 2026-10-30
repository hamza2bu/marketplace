"use client";

import { useActionState, useEffect, useRef, useTransition, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";

export type ActionState = { ok?: boolean; error?: string; message?: string };
type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * A form bound to a server action, with pending state, an optional
 * confirmation, and the action's error/success shown under it.
 * `errors` is the translation namespace for error codes.
 *
 * Submits through a transition rather than the native form action, so React
 * doesn't clear the fields when the server rejects the input. Pass
 * `resetOnSuccess` for "create new" forms.
 */
export function ActionForm({
  action,
  children,
  errors,
  success,
  confirm,
  resetOnSuccess = false,
  className = "space-y-2",
}: {
  action: Action;
  children: ReactNode;
  errors: string;
  success?: string;
  confirm?: string;
  resetOnSuccess?: boolean;
  className?: string;
}) {
  const locale = useLocale();
  const t = useTranslations(errors as "admin.common");
  const form = useRef<HTMLFormElement>(null);
  const [state, dispatch, actionPending] = useActionState<ActionState, FormData>(action, {});
  const [transitionPending, startTransition] = useTransition();
  const pending = actionPending || transitionPending;

  useEffect(() => {
    if (state.ok && resetOnSuccess) form.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form
      ref={form}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        if (confirm && !window.confirm(confirm)) return;
        const data = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
        startTransition(() => dispatch(data));
      }}
    >
      <input type="hidden" name="locale" value={locale} />
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {t.has(state.error as "none") ? t(state.error as "none") : state.error}
        </p>
      )}
      {state.ok && (state.message || success) && (
        <p role="status" className="text-sm text-brand">
          {state.message ?? success}
        </p>
      )}
    </form>
  );
}

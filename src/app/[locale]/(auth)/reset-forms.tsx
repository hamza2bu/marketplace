"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Field } from "@/components/ui/field";
import { requestPasswordResetAction, resetPasswordAction, type ResetState } from "./actions";

function useText() {
  const t = useTranslations("auth");
  const e = useTranslations("errors");
  return (key?: string) => (!key ? undefined : t.has(key as "resetInvalid") ? t(key as "resetInvalid") : e.has(key as "generic") ? e(key as "generic") : e("generic"));
}

export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const text = useText();
  const [state, action, pending] = useActionState<ResetState, FormData>(requestPasswordResetAction, {});
  if (state.sent) return <p role="status" className="rounded-md bg-brand/10 p-3 text-sm">{t("linkSent")}</p>;
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.error && <p role="alert" className="text-sm text-danger">{text(state.error)}</p>}
      <Field label={t("email")} name="email" type="email" autoComplete="email" required error={text(state.fieldErrors?.email)} />
      <button disabled={pending} className="w-full rounded-md bg-brand px-4 py-2.5 font-medium text-brand-foreground disabled:opacity-60">
        {pending ? t("pending") : t("sendLink")}
      </button>
    </form>
  );
}

export function ResetPasswordForm({ email, token }: { email: string; token: string }) {
  const t = useTranslations("auth");
  const nav = useTranslations("nav");
  const text = useText();
  const [state, action, pending] = useActionState<ResetState, FormData>(resetPasswordAction, {});
  if (state.done) {
    return (
      <div className="space-y-3">
        <p role="status" className="rounded-md bg-brand/10 p-3 text-sm">{t("resetDone")}</p>
        <Link href="/sign-in" className="inline-block rounded-md bg-brand px-4 py-2 font-medium text-brand-foreground">
          {nav("signIn")}
        </Link>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="token" value={token} />
      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {text(state.error)}{" "}
          {state.error === "resetInvalid" && (
            <Link href="/forgot-password" className="underline">
              {t("forgot")}
            </Link>
          )}
        </p>
      )}
      <Field label={t("newPassword")} name="password" type="password" autoComplete="new-password" hint={t("passwordHint")} required error={text(state.fieldErrors?.password)} />
      <button disabled={pending} className="w-full rounded-md bg-brand px-4 py-2.5 font-medium text-brand-foreground disabled:opacity-60">
        {pending ? t("pending") : t("savePassword")}
      </button>
    </form>
  );
}

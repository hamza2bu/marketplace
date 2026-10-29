"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Field } from "@/components/ui/field";
import { signInAction, signUpAction, type AuthFormState } from "./actions";

function useErrorText() {
  const t = useTranslations("errors");
  return (key?: string) => (key ? (t.has(key) ? t(key) : t("generic")) : undefined);
}

function SubmitButton({ pending, label }: { pending: boolean; label: string }) {
  const t = useTranslations("auth");
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-brand px-4 py-2.5 font-medium text-brand-foreground disabled:opacity-60"
    >
      {pending ? t("pending") : label}
    </button>
  );
}

function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
      {message}
    </p>
  );
}

export function SignInForm({ callbackUrl }: { callbackUrl?: string }) {
  const t = useTranslations("auth");
  const locale = useLocale();
  const err = useErrorText();
  const [state, action, pending] = useActionState<AuthFormState, FormData>(signInAction, {});

  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="locale" value={locale} />
      {callbackUrl && <input type="hidden" name="callbackUrl" value={callbackUrl} />}
      <FormError message={err(state.error)} />
      <Field label={t("email")} name="email" type="email" autoComplete="email" required
        defaultValue={state.values?.email} error={err(state.fieldErrors?.email)} />
      <Field label={t("password")} name="password" type="password" autoComplete="current-password" required
        error={err(state.fieldErrors?.password)} />
      <SubmitButton pending={pending} label={t("submitSignIn")} />
    </form>
  );
}

export function SignUpForm() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const err = useErrorText();
  const [state, action, pending] = useActionState<AuthFormState, FormData>(signUpAction, {});

  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <FormError message={err(state.error)} />
      <Field label={t("name")} name="name" autoComplete="name" required
        defaultValue={state.values?.name} error={err(state.fieldErrors?.name)} />
      <Field label={t("email")} name="email" type="email" autoComplete="email" required
        defaultValue={state.values?.email} error={err(state.fieldErrors?.email)} />
      <Field label={t("password")} name="password" type="password" autoComplete="new-password" required
        hint={t("passwordHint")} error={err(state.fieldErrors?.password)} />
      <SubmitButton pending={pending} label={t("submitSignUp")} />
    </form>
  );
}

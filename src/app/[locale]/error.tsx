"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";

/** Shown when a page fails to render. The details stay in the server log. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("errorPage");
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto max-w-md space-y-4 py-16 text-center">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="text-muted">{t("body")}</p>
      {error.digest && (
        <p className="text-xs text-muted" dir="ltr">
          #{error.digest}
        </p>
      )}
      <button type="button" onClick={reset} className="rounded-md bg-brand px-4 py-2 font-medium text-brand-foreground">
        {t("retry")}
      </button>
    </div>
  );
}

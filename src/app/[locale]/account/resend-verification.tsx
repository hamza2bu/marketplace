"use client";

import { useState, useTransition } from "react";
import { resendVerificationAction } from "@/app/[locale]/(auth)/actions";

export function ResendVerification({ label, done }: { label: string; done: string }) {
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();
  if (sent) return <span role="status">{done}</span>;
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(async () => setSent((await resendVerificationAction()).ok))}
      className="font-medium underline disabled:opacity-60"
    >
      {label}
    </button>
  );
}

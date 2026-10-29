"use client";

import { signOut, useSession } from "next-auth/react";
import { Link } from "@/i18n/navigation";

type Labels = Record<"signIn" | "signUp" | "signOut" | "account" | "seller" | "admin" | "menu", string>;

export function UserMenu({ locale, labels }: { locale: string; labels: Labels }) {
  const { data: session, status } = useSession();

  if (status === "loading") return <span className="inline-block h-5 w-24 animate-pulse rounded bg-surface" />;

  if (!session?.user) {
    return (
      <>
        <Link href="/sign-in">{labels.signIn}</Link>
        <Link href="/sign-up" className="hidden rounded-md bg-brand px-3 py-1.5 font-medium text-brand-foreground sm:inline-block">
          {labels.signUp}
        </Link>
      </>
    );
  }

  const { role } = session.user;
  return (
    <details className="relative">
      <summary className="cursor-pointer list-none rounded-md border border-border px-3 py-1.5">
        {session.user.name?.split(" ")[0] ?? labels.menu}
      </summary>
      <ul className="absolute end-0 z-20 mt-2 w-48 space-y-1 rounded-md border border-border bg-background p-2 shadow-lg">
        <li>
          <Link href="/account" className="block rounded px-2 py-1.5 hover:bg-surface">
            {labels.account}
          </Link>
        </li>
        {role === "SELLER" && (
          <li>
            <Link href="/seller" className="block rounded px-2 py-1.5 hover:bg-surface">
              {labels.seller}
            </Link>
          </li>
        )}
        {role === "ADMIN" && (
          <li>
            <Link href="/admin" className="block rounded px-2 py-1.5 hover:bg-surface">
              {labels.admin}
            </Link>
          </li>
        )}
        <li>
          <button
            type="button"
            onClick={() => signOut({ redirectTo: `/${locale}` })}
            className="block w-full rounded px-2 py-1.5 text-start text-muted hover:bg-surface"
          >
            {labels.signOut}
          </button>
        </li>
      </ul>
    </details>
  );
}

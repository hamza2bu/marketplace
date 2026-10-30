"use client";

import { useEffect, useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";

export const CART_CHANGED_EVENT = "cart:changed";

/** Header cart link with the item count (fetched in the browser so the header can stay static). */
export function CartLink({ label, countLabel }: { label: string; countLabel: (count: number) => string }) {
  const [count, setCount] = useState<number | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch("/api/cart", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { count: 0 }))
        .then((d: { count: number }) => !cancelled && setCount(d.count))
        .catch(() => {});
    load();
    window.addEventListener(CART_CHANGED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(CART_CHANGED_EVENT, load);
    };
  }, [pathname]);

  return (
    <Link href="/cart" aria-label={count === null ? label : countLabel(count)} className="relative inline-flex items-center gap-1">
      <svg aria-hidden viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.8L21 8H6.2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="9.5" cy="19.5" r="1.3" />
        <circle cx="17.5" cy="19.5" r="1.3" />
      </svg>
      {count ? (
        <span className="absolute -top-1.5 -end-2 min-w-5 rounded-full bg-danger px-1 text-center text-xs leading-5 font-bold text-white">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}

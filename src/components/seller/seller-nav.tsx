"use client";

import { Link, usePathname } from "@/i18n/navigation";

const ITEMS = ["", "/products", "/discounts", "/orders", "/returns", "/earnings", "/settings"] as const;

/** Seller area navigation: a scrollable tab bar on mobile, a sidebar on desktop. */
export function SellerNav({ labels, badges }: { labels: Record<string, string>; badges: Record<string, number> }) {
  const pathname = usePathname();
  return (
    <nav aria-label={labels.dashboard}>
      <ul className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
        {ITEMS.map((item) => {
          const href = `/seller${item}`;
          const active = item === "" ? pathname === "/seller" : pathname.startsWith(href);
          const key = item ? item.slice(1) : "dashboard";
          return (
            <li key={key} className="shrink-0">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm whitespace-nowrap ${
                  active ? "bg-brand/10 font-semibold text-brand" : "hover:bg-surface"
                }`}
              >
                {labels[key]}
                {badges[key] ? <span className="rounded-full bg-danger px-1.5 text-xs leading-5 text-white">{badges[key]}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

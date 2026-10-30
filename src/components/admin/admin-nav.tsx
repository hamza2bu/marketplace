"use client";

import { Link, usePathname } from "@/i18n/navigation";

export const ADMIN_SECTIONS = ["", "/shops", "/products", "/reviews", "/orders", "/disputes", "/payouts", "/reports", "/categories", "/banners", "/settings", "/users", "/audit"] as const;

export function AdminNav({ labels, badges }: { labels: Record<string, string>; badges: Record<string, number> }) {
  const pathname = usePathname();
  return (
    <nav aria-label={labels.overview}>
      <ul className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
        {ADMIN_SECTIONS.map((item) => {
          const href = `/admin${item}`;
          const key = item ? item.slice(1) : "overview";
          const active = item === "" ? pathname === "/admin" : pathname.startsWith(href);
          return (
            <li key={key} className="shrink-0">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm whitespace-nowrap ${active ? "bg-brand/10 font-semibold text-brand" : "hover:bg-surface"}`}
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

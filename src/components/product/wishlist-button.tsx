"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter, usePathname } from "@/i18n/navigation";
import { toggleWishlistAction } from "@/app/[locale]/account/actions";

/** Heart toggle on the product page. Signed-out visitors are sent to sign in first. */
export function WishlistButton({ productId }: { productId: string }) {
  const t = useTranslations("wishlist");
  const router = useRouter();
  const pathname = usePathname();
  const [saved, setSaved] = useState<boolean | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    fetch(`/api/wishlist/${productId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { saved: boolean | null }) => setSaved(d.saved))
      .catch(() => {});
  }, [productId]);

  return (
    <button
      type="button"
      aria-pressed={saved === true}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await toggleWishlistAction(productId);
          if (result.saved === null) router.push(`/sign-in?callbackUrl=${encodeURIComponent(pathname)}`);
          else setSaved(result.saved);
        })
      }
      className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-3 text-sm font-medium hover:border-foreground disabled:opacity-60"
    >
      <span aria-hidden className={`text-lg leading-none ${saved ? "text-danger" : ""}`}>
        {saved ? "♥" : "♡"}
      </span>
      {saved ? t("saved") : t("add")}
    </button>
  );
}

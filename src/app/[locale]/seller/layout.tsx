import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SellerNav } from "@/components/seller/seller-nav";
import { getCurrentUser } from "@/server/auth/guards";
import { sellerActionCounts } from "@/server/seller/orders";

// Navigation chrome only. Every seller page and action checks access itself
// (requireSeller), because layouts don't re-run on client navigation.
export default async function SellerLayout({ children }: LayoutProps<"/[locale]/seller">) {
  const user = await getCurrentUser();
  if (!user?.shop || user.role !== "SELLER") return children;

  const [t, statusT, sellerT, counts] = await Promise.all([
    getTranslations("seller.nav"),
    getTranslations("shopStatus"),
    getTranslations("seller"),
    sellerActionCounts(user.shop.id),
  ]);
  const labels = Object.fromEntries(
    (["dashboard", "products", "discounts", "orders", "returns", "reviews", "earnings", "settings"] as const).map((k) => [k, t(k)]),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          <span className="font-semibold text-foreground">{user.shop.name}</span> · {statusT(user.shop.status)}
        </p>
        {user.shop.status === "APPROVED" && (
          <Link href={`/s/${user.shop.slug}`} className="text-sm text-brand underline">
            {t("storefront")}
          </Link>
        )}
      </div>
      {user.shop.status === "PENDING" && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{sellerT("pendingNotice")}</p>
      )}
      {user.shop.status === "SUSPENDED" && (
        <p className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{sellerT("suspendedNotice")}</p>
      )}
      <div className="grid gap-6 lg:grid-cols-[12rem_1fr]">
        <aside>
          <SellerNav labels={labels} badges={{ orders: counts.toProcess + counts.toShip, returns: counts.returns }} />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}

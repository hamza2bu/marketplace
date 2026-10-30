import { getTranslations } from "next-intl/server";
import { AdminNav } from "@/components/admin/admin-nav";
import { getCurrentUser } from "@/server/auth/guards";
import { db } from "@/server/db";

// Navigation chrome only; every admin page and action checks access itself.
export default async function AdminLayout({ children }: LayoutProps<"/[locale]/admin">) {
  const user = await getCurrentUser();
  if (user?.role !== "ADMIN") return children;

  const [t, pendingShops, pendingProducts, disputes, flagged] = await Promise.all([
    getTranslations("admin.nav"),
    db.shop.count({ where: { status: "PENDING" } }),
    db.product.count({ where: { status: "PENDING_REVIEW" } }),
    db.dispute.count({ where: { status: { not: "RESOLVED" } } }),
    db.review.count({ where: { status: "FLAGGED" } }),
  ]);
  const keys = ["overview", "shops", "products", "reviews", "orders", "disputes", "payouts", "reports", "categories", "banners", "settings", "users", "audit"] as const;

  return (
    <div className="grid gap-6 lg:grid-cols-[12rem_1fr]">
      <aside>
        <AdminNav
          labels={Object.fromEntries(keys.map((k) => [k, t(k)]))}
          badges={{ shops: pendingShops, products: pendingProducts, disputes, reviews: flagged }}
        />
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

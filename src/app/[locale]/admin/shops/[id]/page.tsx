import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ActionForm } from "@/components/admin/action-form";
import { Stat } from "@/components/seller/stat";
import { formatMoney } from "@/lib/money";
import { requireAdmin } from "@/server/auth/guards";
import { getShopForAdmin, SHOP_TRANSITIONS } from "@/server/admin/shops";
import { revealBankAction, shopCommissionAction, shopStatusAction } from "../../actions";

export const metadata: Metadata = { robots: { index: false } };

const input = "w-full rounded-md border border-border bg-background px-2 py-1.5 text-base";

export default async function AdminShopPage({ params }: PageProps<"/[locale]/admin/shops/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireAdmin(locale);
  const shop = await getShopForAdmin(id);
  if (!shop) notFound();
  const [t, common, statusT, dash] = await Promise.all([
    getTranslations("admin.shops"),
    getTranslations("admin.common"),
    getTranslations("shopStatus"),
    getTranslations("seller.dashboard"),
  ]);
  const address = shop.businessAddress as { line1?: string; city?: string; postalCode?: string };
  const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const allowed = SHOP_TRANSITIONS[shop.status];
  const label: Record<string, string> = {
    APPROVED: shop.status === "PENDING" ? t("approve") : t("reactivate"),
    SUSPENDED: t("suspend"),
    REMOVED: shop.status === "PENDING" ? t("reject") : t("remove"),
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{shop.name}</h1>
          <p className="text-sm text-muted" dir="ltr">
            /s/{shop.slug}
          </p>
        </div>
        <span className="rounded-full bg-surface px-3 py-1 text-sm font-medium">{statusT(shop.status)}</span>
      </div>
      {shop.statusReason && <p className="text-sm text-muted">{t("statusReason", { reason: shop.statusReason })}</p>}

      {allowed.length > 0 && (
        <section className="space-y-3 rounded-lg border border-brand/40 p-4">
          <h2 className="font-semibold">{t("actions")}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {allowed.map((to) => (
              <ActionForm key={to} action={shopStatusAction} errors="admin.shops.errors" success={common("saved")} confirm={to === "REMOVED" ? t("removeWarning") : undefined}>
                <input type="hidden" name="shopId" value={shop.id} />
                <input type="hidden" name="to" value={to} />
                {to !== "APPROVED" && <input name="reason" placeholder={common("reasonShown")} aria-label={common("reasonShown")} className={input} />}
                <button
                  className={`rounded-md px-4 py-2 text-sm font-semibold ${to === "APPROVED" ? "bg-brand text-brand-foreground" : "border border-danger text-danger"}`}
                >
                  {label[to]}
                </button>
              </ActionForm>
            ))}
          </div>
          <p className="text-xs text-muted">{t("openOrders", { count: shop.openOrders })}</p>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-2 text-sm">
          <h2 className="font-semibold">{t("business")}</h2>
          <p>{shop.legalName}</p>
          <p dir="ltr" className="text-start">
            {shop.taxId}
          </p>
          <p>
            {address.line1}, {address.city} {address.postalCode}
          </p>
          <h2 className="pt-2 font-semibold">{t("contact")}</h2>
          <p dir="ltr" className="text-start">
            {shop.contactEmail} · {shop.contactPhone}
          </p>
          <p className="text-muted" dir="ltr">
            {t("owner")}: {shop.owner.email}
          </p>
          {shop.description && <p className="text-muted">{shop.description}</p>}
        </section>

        <section className="space-y-3 text-sm">
          <h2 className="font-semibold">{t("bank")}</h2>
          <p>{shop.payoutBankLast4 ? `•••• ${shop.payoutBankLast4}` : "—"}</p>
          {shop.payoutBankLast4 && (
            <ActionForm action={revealBankAction} errors="admin.shops.errors">
              <input type="hidden" name="shopId" value={shop.id} />
              <button className="text-brand underline">{t("reveal")}</button>
            </ActionForm>
          )}
          <h2 className="pt-2 font-semibold">{t("commissionOverride")}</h2>
          <ActionForm action={shopCommissionAction} errors="admin.shops.errors" success={common("saved")} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="shopId" value={shop.id} />
            <input
              name="percent"
              inputMode="decimal"
              dir="ltr"
              defaultValue={shop.commissionBpsOverride === null ? "" : shop.commissionBpsOverride / 100}
              aria-label={t("commissionOverride")}
              className={`${input} w-24`}
            />
            <button className="rounded-md border border-border px-3 py-1.5">{common("save")}</button>
          </ActionForm>
          <p className="text-xs text-muted">{t("commissionHint")}</p>
        </section>
      </div>

      <section className="space-y-2">
        <h2 className="font-semibold">{t("money")}</h2>
        <dl className="grid gap-3 sm:grid-cols-3">
          <Stat label={dash("held")} value={formatMoney(shop.money.heldMinor, locale)} />
          <Stat label={dash("available")} value={formatMoney(shop.money.availableMinor, locale)} />
          <Stat label={dash("paidOut")} value={formatMoney(shop.money.paidOutMinor, locale)} />
        </dl>
        <p className="text-sm">
          <Link href={`/admin/products?q=${encodeURIComponent(shop.name)}`} className="text-brand underline">
            {t("products")}: {shop._count.products}
          </Link>{" "}
          · {t("orders")}: {shop._count.subOrders}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">{t("history")}</h2>
        <ul className="space-y-1 text-sm">
          {shop.history.map((h) => (
            <li key={h.id} className="text-muted">
              {dateTime.format(h.createdAt)} · <span className="text-foreground">{h.action}</span> · {h.actor?.email ?? "—"}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

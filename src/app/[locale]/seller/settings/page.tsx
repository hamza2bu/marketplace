import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireSeller } from "@/server/auth/guards";
import { db } from "@/server/db";
import { BankForm, ProfileForm } from "./settings-forms";

export const metadata: Metadata = { robots: { index: false } };

export default async function SellerSettingsPage({ params }: PageProps<"/[locale]/seller/settings">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { shop: current } = await requireSeller(locale);
  const [t, sell, shop] = await Promise.all([
    getTranslations("seller.settings"),
    getTranslations("sell"),
    db.shop.findUniqueOrThrow({
      where: { id: current.id },
      select: { name: true, slug: true, description: true, contactEmail: true, contactPhone: true, logoUrl: true, bannerUrl: true, legalName: true, taxId: true, payoutBankLast4: true },
    }),
  ]);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("profile")}</h2>
        <ProfileForm shop={shop} />
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("payout")}</h2>
        <p className="text-sm">{shop.payoutBankLast4 ? t("currentAccount", { last4: shop.payoutBankLast4 }) : t("noAccount")}</p>
        <BankForm />
      </section>
      <section className="space-y-2 text-sm">
        <h2 className="text-lg font-semibold">{t("business")}</h2>
        <dl className="grid gap-2 sm:grid-cols-3">
          <div>
            <dt className="text-muted">{sell("legalName")}</dt>
            <dd>{shop.legalName}</dd>
          </div>
          <div>
            <dt className="text-muted">{sell("taxId")}</dt>
            <dd dir="ltr" className="text-start">
              {shop.taxId}
            </dd>
          </div>
          <div>
            <dt className="text-muted">{sell("slug")}</dt>
            <dd dir="ltr" className="text-start">
              /s/{shop.slug}
            </dd>
          </div>
        </dl>
        <p className="text-muted">{t("businessHint")}</p>
      </section>
    </div>
  );
}

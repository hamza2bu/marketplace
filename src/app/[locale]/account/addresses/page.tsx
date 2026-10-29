import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AddressForm } from "@/components/account/address-form";
import { deleteAddressAction } from "@/app/[locale]/checkout/actions";
import { requireUser } from "@/server/auth/guards";
import { db } from "@/server/db";

export const metadata: Metadata = { robots: { index: false } };

export default async function AddressesPage({ params }: PageProps<"/[locale]/account/addresses">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale, `/${locale}/account/addresses`);
  const [t, checkoutT, addresses] = await Promise.all([
    getTranslations("addresses"),
    getTranslations("checkout"),
    db.address.findMany({ where: { userId: user.id }, orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }] }),
  ]);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      {addresses.length === 0 ? (
        <p className="text-muted">{t("empty")}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {addresses.map((a) => (
            <li key={a.id} className="space-y-1 rounded-lg border border-border p-4 text-sm">
              <p className="font-medium">
                {a.fullName}
                {a.isDefault && <span className="ms-2 rounded bg-brand/10 px-2 py-0.5 text-xs text-brand">{t("default")}</span>}
              </p>
              <p>
                {a.line1}
                {a.line2 ? `, ${a.line2}` : ""}
              </p>
              <p>
                {a.city} {a.postalCode}
              </p>
              <p dir="ltr" className="text-start text-muted">
                {a.phone}
              </p>
              <form action={deleteAddressAction}>
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="addressId" value={a.id} />
                <button className="text-muted underline hover:text-danger">{t("delete")}</button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <section className="space-y-4 rounded-lg border border-border p-4">
        <h2 className="text-lg font-semibold">{checkoutT("addAddress")}</h2>
        <AddressForm submitLabel={checkoutT("saveAddress")} />
      </section>
    </div>
  );
}

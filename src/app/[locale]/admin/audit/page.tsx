import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { FilterBar, readListParams } from "@/components/admin/filter-bar";
import { Pagination } from "@/components/catalog/pagination";
import { requireAdmin } from "@/server/auth/guards";
import { auditTrail } from "@/server/admin/users";

export const metadata: Metadata = { robots: { index: false } };
const ENTITIES = ["Shop", "Product", "Review", "Order", "SubOrder", "Dispute", "Category", "Banner", "PlatformSettings", "User"] as const;

export default async function AdminAuditPage({ params, searchParams }: PageProps<"/[locale]/admin/audit">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin(locale);
  const { status: entity, page } = readListParams(await searchParams, ENTITIES);
  const [t, common, catalogT, { entries, pageCount }] = await Promise.all([
    getTranslations("admin.audit"),
    getTranslations("admin.common"),
    getTranslations("catalog"),
    auditTrail({ entity, page }),
  ]);
  const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "medium" });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <FilterBar basePath="/admin/audit" locale={locale} tabs={ENTITIES.map((e) => ({ value: e, label: e }))} current={entity} allLabel={common("all")} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] text-sm">
          <thead>
            <tr className="border-b border-border text-muted">
              <th className="p-2 text-start font-medium">{common("date")}</th>
              <th className="p-2 text-start font-medium">{t("who")}</th>
              <th className="p-2 text-start font-medium">{t("what")}</th>
              <th className="p-2 text-start font-medium">{t("on")}</th>
              <th className="p-2 text-start font-medium">{t("details")}</th>
            </tr>
          </thead>
          <tbody dir="ltr">
            {entries.map((e) => (
              <tr key={e.id} className="border-b border-border align-top">
                <td className="p-2 whitespace-nowrap">{dateTime.format(e.createdAt)}</td>
                <td className="p-2">{e.actor?.email ?? t("system")}</td>
                <td className="p-2 font-medium">{e.action}</td>
                <td className="p-2 text-xs">
                  {e.entity} {e.entityId.slice(0, 10)}
                </td>
                <td className="max-w-xs p-2 font-mono text-xs break-all text-muted">{JSON.stringify(e.meta) === "{}" ? "" : JSON.stringify(e.meta)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination
        page={page}
        pageCount={pageCount}
        hrefFor={(n) => `/admin/audit?${new URLSearchParams({ ...(entity ? { status: entity } : {}), page: String(n) })}`}
        labels={{ pagination: catalogT("pagination"), previous: catalogT("previous"), next: catalogT("next"), pageOf: catalogT("pageOf", { page, pageCount }) }}
      />
    </div>
  );
}

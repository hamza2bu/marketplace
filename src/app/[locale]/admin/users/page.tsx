import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ActionForm } from "@/components/admin/action-form";
import { FilterBar, readListParams } from "@/components/admin/filter-bar";
import { Pagination } from "@/components/catalog/pagination";
import { requireAdmin } from "@/server/auth/guards";
import { listUsers } from "@/server/admin/users";
import type { Role } from "@/generated/prisma/enums";
import { userStatusAction } from "../actions";

export const metadata: Metadata = { robots: { index: false } };
const ROLES: Role[] = ["CUSTOMER", "SELLER", "ADMIN"];

export default async function AdminUsersPage({ params, searchParams }: PageProps<"/[locale]/admin/users">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const admin = await requireAdmin(locale);
  const { status: role, q, page } = readListParams(await searchParams, ROLES);
  const [t, common, rolesT, catalogT, { users, pageCount }] = await Promise.all([
    getTranslations("admin.users"),
    getTranslations("admin.common"),
    getTranslations("roles"),
    getTranslations("catalog"),
    listUsers({ role, q, page }),
  ]);
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <FilterBar basePath="/admin/users" locale={locale} tabs={ROLES.map((r) => ({ value: r, label: rolesT(r) }))} current={role} q={q} searchLabel={t("search")} allLabel={common("all")} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="border-b border-border text-muted">
              <th className="p-2 text-start font-medium">{t("email")}</th>
              <th className="p-2 text-start font-medium">{common("status")}</th>
              <th className="p-2 text-start font-medium">{t("joined")}</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-border">
                <td className="p-2">
                  <span dir="ltr">{u.email}</span>
                  <span className="block text-xs text-muted">
                    {u.name} · {rolesT(u.role)}
                    {u.shop ? ` · ${u.shop.name}` : ""}
                  </span>
                </td>
                <td className="p-2">
                  <span className={u.status === "SUSPENDED" ? "text-danger" : ""}>{t(`status.${u.status}`)}</span>
                </td>
                <td className="p-2">{dateFmt.format(u.createdAt)}</td>
                <td className="p-2">
                  {u.role !== "ADMIN" && u.id !== admin.id && (
                    <ActionForm action={userStatusAction} errors="admin.common">
                      <input type="hidden" name="userId" value={u.id} />
                      <button name="status" value={u.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE"} className={u.status === "ACTIVE" ? "text-danger underline" : "text-brand underline"}>
                        {u.status === "ACTIVE" ? t("suspend") : t("activate")}
                      </button>
                    </ActionForm>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination
        page={page}
        pageCount={pageCount}
        hrefFor={(n) => `/admin/users?${new URLSearchParams({ ...(role ? { status: role } : {}), ...(q ? { q } : {}), page: String(n) })}`}
        labels={{ pagination: catalogT("pagination"), previous: catalogT("previous"), next: catalogT("next"), pageOf: catalogT("pageOf", { page, pageCount }) }}
      />
    </div>
  );
}

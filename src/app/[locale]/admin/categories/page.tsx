import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ActionForm } from "@/components/admin/action-form";
import { ImagePicker } from "@/components/ui/image-picker";
import { localized } from "@/lib/i18n-text";
import { requireAdmin } from "@/server/auth/guards";
import { db } from "@/server/db";
import { listCategoriesForAdmin } from "@/server/admin/catalog";
import { deleteCategoryAction, saveCategoryAction } from "../actions";

export const metadata: Metadata = { robots: { index: false } };
const input = "w-full rounded-md border border-border bg-background px-2 py-1.5 text-base";

type Category = Awaited<ReturnType<typeof listCategoriesForAdmin>>[number];

async function CategoryFields({ category, parents, locale }: { category?: Category; parents: Category[]; locale: string }) {
  const t = await getTranslations("admin.categories");
  const name = (category?.name ?? {}) as Record<string, string>;
  return (
    <>
      {category && <input type="hidden" name="categoryId" value={category.id} />}
      <div className="grid gap-3 sm:grid-cols-3">
        {(["He", "Ar", "En"] as const).map((l) => (
          <label key={l} className="text-sm">
            <span className="mb-1 block">{t(`name${l}`)}</span>
            <input name={`name${l}`} required defaultValue={name[l.toLowerCase()]} dir={l === "En" ? "ltr" : "rtl"} className={input} />
          </label>
        ))}
        <label className="text-sm">
          <span className="mb-1 block">{t("slug")}</span>
          <input name="slug" required defaultValue={category?.slug} dir="ltr" className={input} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block">{t("parent")}</span>
          <select name="parentId" defaultValue={category?.parentId ?? ""} className={input}>
            <option value="">{t("topLevel")}</option>
            {parents
              .filter((p) => p.id !== category?.id)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {localized(p.name, locale)}
                </option>
              ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block">{t("commission")}</span>
          <input name="commission" inputMode="decimal" dir="ltr" defaultValue={category?.commissionBps != null ? category.commissionBps / 100 : ""} className={input} />
          <span className="text-xs text-muted">{t("commissionHint")}</span>
        </label>
        <label className="text-sm">
          <span className="mb-1 block">{t("sortOrder")}</span>
          <input name="sortOrder" type="number" min={0} defaultValue={category?.sortOrder ?? 0} className={input} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isActive" defaultChecked={category?.isActive ?? true} className="size-4 accent-brand" />
          {t("active")}
        </label>
      </div>
      <ImagePicker name="imageUrl" label={t("image")} initial={category?.imageUrl ?? null} wide />
    </>
  );
}

export default async function AdminCategoriesPage({ params }: PageProps<"/[locale]/admin/categories">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin(locale);
  const [t, common, categories, settings] = await Promise.all([
    getTranslations("admin.categories"),
    getTranslations("admin.common"),
    listCategoriesForAdmin(),
    db.platformSettings.findUnique({ where: { id: 1 } }),
  ]);
  const tops = categories.filter((c) => !c.parentId);
  const pct = (bps: number) => `${bps / 100}%`;
  const effective = (c: Category) => {
    if (c.commissionBps !== null) return pct(c.commissionBps);
    const parent = categories.find((p) => p.id === c.parentId);
    return `${pct(parent?.commissionBps ?? settings?.globalCommissionBps ?? 1000)} (${t("inherited")})`;
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <ul className="space-y-2">
        {tops.flatMap((top) => [top, ...categories.filter((c) => c.parentId === top.id)]).map((c) => (
          <li key={c.id} className={`rounded-lg border border-border ${c.parentId ? "ms-6" : ""}`}>
            <details>
              <summary className="flex cursor-pointer flex-wrap items-center gap-3 p-3 text-sm">
                <span className="font-medium">{localized(c.name, locale)}</span>
                <span className="text-muted" dir="ltr">
                  {c.slug}
                </span>
                <span className="ms-auto">{effective(c)}</span>
                <span className="text-muted">{t("products", { count: c._count.products })}</span>
                {!c.isActive && <span className="rounded bg-surface px-1 text-xs">✕ {t("active")}</span>}
              </summary>
              <div className="space-y-3 border-t border-border p-3">
                <ActionForm action={saveCategoryAction} errors="admin.categories.errors" success={common("saved")} className="space-y-3">
                  <CategoryFields category={c} parents={tops} locale={locale} />
                  <button className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground">{common("save")}</button>
                </ActionForm>
                <ActionForm action={deleteCategoryAction} errors="admin.categories.errors" confirm={common("confirm")}>
                  <input type="hidden" name="categoryId" value={c.id} />
                  <button className="text-sm text-danger underline">{common("delete")}</button>
                </ActionForm>
              </div>
            </details>
          </li>
        ))}
      </ul>
      <section className="space-y-3 rounded-lg border border-border p-4">
        <h2 className="font-semibold">{t("new")}</h2>
        <ActionForm action={saveCategoryAction} errors="admin.categories.errors" success={common("saved")} className="space-y-3" resetOnSuccess>
          <CategoryFields parents={tops} locale={locale} />
          <button className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground">{common("save")}</button>
        </ActionForm>
      </section>
    </div>
  );
}

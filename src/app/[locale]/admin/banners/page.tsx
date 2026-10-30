import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ActionForm } from "@/components/admin/action-form";
import { ImagePicker } from "@/components/ui/image-picker";
import { toLocalDateTimeInput } from "@/lib/dates";
import { localized } from "@/lib/i18n-text";
import { requireAdmin } from "@/server/auth/guards";
import { db } from "@/server/db";
import type { Banner } from "@/generated/prisma/client";
import { deleteBannerAction, saveBannerAction } from "../actions";

export const metadata: Metadata = { robots: { index: false } };
const input = "w-full rounded-md border border-border bg-background px-2 py-1.5 text-base";

async function BannerFields({ banner }: { banner?: Banner }) {
  const t = await getTranslations("admin.banners");
  const title = (banner?.title ?? {}) as Record<string, string>;
  const subtitle = (banner?.subtitle ?? {}) as Record<string, string>;
  return (
    <>
      {banner && <input type="hidden" name="bannerId" value={banner.id} />}
      <ImagePicker name="imageUrl" label={t("image")} initial={banner?.imageUrl ?? null} wide />
      <div className="grid gap-3 sm:grid-cols-3">
        {(["He", "Ar", "En"] as const).map((l) => (
          <label key={`t${l}`} className="text-sm">
            <span className="mb-1 block">{t(`title${l}`)}</span>
            <input name={`title${l}`} defaultValue={title[l.toLowerCase()]} dir={l === "En" ? "ltr" : "rtl"} className={input} />
          </label>
        ))}
        {(["He", "Ar", "En"] as const).map((l) => (
          <label key={`s${l}`} className="text-sm">
            <span className="mb-1 block">{t(`subtitle${l}`)}</span>
            <input name={`subtitle${l}`} defaultValue={subtitle[l.toLowerCase()]} dir={l === "En" ? "ltr" : "rtl"} className={input} />
          </label>
        ))}
        <label className="text-sm">
          <span className="mb-1 block">{t("link")}</span>
          <input name="linkUrl" required defaultValue={banner?.linkUrl ?? "/"} dir="ltr" className={input} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block">{t("startsAt")}</span>
          <input type="datetime-local" name="startsAt" defaultValue={banner?.startsAt ? toLocalDateTimeInput(banner.startsAt) : ""} className={input} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block">{t("endsAt")}</span>
          <input type="datetime-local" name="endsAt" defaultValue={banner?.endsAt ? toLocalDateTimeInput(banner.endsAt) : ""} className={input} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block">#</span>
          <input name="sortOrder" type="number" min={0} max={100} defaultValue={banner?.sortOrder ?? 0} className={input} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isActive" defaultChecked={banner?.isActive ?? true} className="size-4 accent-brand" />
          {t("active")}
        </label>
      </div>
    </>
  );
}

export default async function AdminBannersPage({ params }: PageProps<"/[locale]/admin/banners">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin(locale);
  const [t, common, banners] = await Promise.all([
    getTranslations("admin.banners"),
    getTranslations("admin.common"),
    db.banner.findMany({ orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }] }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <ul className="space-y-2">
        {banners.map((b) => (
          <li key={b.id} className="rounded-lg border border-border">
            <details>
              <summary className="flex cursor-pointer flex-wrap items-center gap-3 p-3 text-sm">
                <span className="font-medium">{localized(b.title, locale)}</span>
                <span className="text-muted" dir="ltr">
                  {b.linkUrl}
                </span>
                {!b.isActive && <span className="rounded bg-surface px-1 text-xs">✕ {t("active")}</span>}
              </summary>
              <div className="space-y-3 border-t border-border p-3">
                <ActionForm action={saveBannerAction} errors="admin.banners.errors" success={common("saved")} className="space-y-3">
                  <BannerFields banner={b} />
                  <button className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground">{common("save")}</button>
                </ActionForm>
                <ActionForm action={deleteBannerAction} errors="admin.common" confirm={common("confirm")}>
                  <input type="hidden" name="bannerId" value={b.id} />
                  <button className="text-sm text-danger underline">{common("delete")}</button>
                </ActionForm>
              </div>
            </details>
          </li>
        ))}
      </ul>
      <section className="space-y-3 rounded-lg border border-border p-4">
        <h2 className="font-semibold">{t("new")}</h2>
        <ActionForm action={saveBannerAction} errors="admin.banners.errors" success={common("saved")} className="space-y-3" resetOnSuccess>
          <BannerFields />
          <button className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground">{common("save")}</button>
        </ActionForm>
      </section>
    </div>
  );
}

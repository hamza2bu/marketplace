import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export async function SiteFooter() {
  const t = await getTranslations("nav");
  const meta = await getTranslations("meta");
  return (
    <footer className="mt-16 border-t border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6 text-sm">
        <p className="text-muted">{meta("description")}</p>
        <nav className="flex gap-4">
          <Link href="/deals">{t("deals")}</Link>
          <Link href="/sell" className="font-medium text-brand">
            {t("sell")}
          </Link>
        </nav>
      </div>
    </footer>
  );
}

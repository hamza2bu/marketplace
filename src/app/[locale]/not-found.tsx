import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export default function NotFound() {
  const t = useTranslations("notFound");
  return (
    <div className="mx-auto max-w-md space-y-4 py-16 text-center">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="text-muted">{t("body")}</p>
      <Link href="/" className="inline-block rounded-md bg-brand px-4 py-2 font-medium text-brand-foreground">
        {t("back")}
      </Link>
    </div>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SessionProvider } from "next-auth/react";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { directionOf, routing } from "@/i18n/routing";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { SITE_URL } from "@/lib/site";
import "../globals.css";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: t("title"), template: `%s · ${t("title")}` },
    description: t("description"),
    alternates: {
      languages: Object.fromEntries(routing.locales.map((l) => [l, `/${l}`])),
    },
  };
}

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations("nav");

  return (
    <html lang={locale} dir={directionOf(locale)}>
      <body className="min-h-dvh antialiased">
        <NextIntlClientProvider>
          <SessionProvider>
            <a href="#content" className="sr-only rounded-md bg-brand px-4 py-2 text-brand-foreground focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50">
              {t("skip")}
            </a>
            <SiteHeader locale={locale} />
            <main id="content" tabIndex={-1} className="mx-auto w-full max-w-6xl px-4 py-6 outline-none sm:py-8">
              {children}
            </main>
            <SiteFooter />
          </SessionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

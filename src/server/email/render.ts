import { createTranslator } from "next-intl";
import { directionOf, routing, type Locale } from "@/i18n/routing";
import { formatMoney } from "@/lib/money";
import { SITE_URL } from "@/lib/site";
import en from "@/messages/en.json";
import he from "@/messages/he.json";
import ar from "@/messages/ar.json";

const MESSAGES = { en, he, ar } as const;

export type RenderedEmail = { subject: string; html: string; text: string };

const escape = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Where the email's button goes, per template. Paths are locale-less. */
function actionFor(template: string, payload: Record<string, unknown>): { path: string; label: "viewOrder" | "openDashboard" | "action" } | null {
  const order = typeof payload.orderNumber === "string" ? `/account/orders/${payload.orderNumber}` : null;
  if (template === "password-reset" || template === "verify-email") return { path: String(payload.path ?? "/"), label: "action" };
  if (template.startsWith("seller-") || template.startsWith("shop-") || template.startsWith("product-") || template === "payout-sent" || template === "dispute-opened") {
    return { path: template === "payout-sent" ? "/seller/earnings" : "/seller", label: "openDashboard" };
  }
  return order ? { path: order, label: "viewOrder" } : null;
}

/**
 * Builds an email in the recipient's language: a subject, a small RTL-aware
 * HTML body with one button, and a plain-text version. Values from the
 * payload are escaped.
 */
export function renderEmail(template: string, payload: Record<string, unknown>, localeValue: string | null | undefined): RenderedEmail {
  const locale: Locale = routing.locales.includes(localeValue as Locale) ? (localeValue as Locale) : routing.defaultLocale;
  const messages = MESSAGES[locale];
  const t = createTranslator({ locale, messages, namespace: "emails" });
  const brand = messages.nav.brand;

  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (typeof value === "string" || typeof value === "number") values[key] = String(value);
  }
  if (typeof payload.amountMinor === "number") values.amount = formatMoney(payload.amountMinor, locale);
  values.reason ||= "—";
  values.note ||= "—";

  const key = template as "order-confirmation";
  if (!t.has(`${key}.subject`)) throw new Error(`Unknown email template: ${template}`);
  const subject = t(`${key}.subject`, values);
  const body = t(`${key}.body`, values);
  const action = actionFor(template, payload);
  const actionLabel = action ? (action.label === "action" ? t(`${key}.action` as "password-reset.action") : t(action.label)) : null;
  const url = action ? `${SITE_URL}/${locale}${action.path}` : null;
  const dir = directionOf(locale);
  const footer = t("footer", { brand });

  const html = `<!doctype html>
<html lang="${locale}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(subject)}</title></head>
<body style="margin:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#171717">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;text-align:${dir === "rtl" ? "right" : "left"}" dir="${dir}">
<tr><td style="padding:20px 24px;border-bottom:1px solid #e5e7eb;font-size:22px;font-weight:bold;color:#0f766e">${escape(brand)}</td></tr>
<tr><td style="padding:24px"><h1 style="margin:0 0 12px;font-size:20px">${escape(subject)}</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6">${escape(body)}</p>
${url && actionLabel ? `<a href="${escape(url)}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:bold">${escape(actionLabel)}</a>` : ""}
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280">${escape(footer)}</td></tr>
</table></td></tr></table></body></html>`;

  const text = [subject, "", body, ...(url && actionLabel ? ["", `${actionLabel}: ${url}`] : []), "", footer].join("\n");
  return { subject, html, text };
}

"use server";

import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { requireUser } from "@/server/auth/guards";
import { encryptJson } from "@/server/crypto";
import { db } from "@/server/db";
import { rateLimit } from "@/server/rate-limit";
import { Prisma } from "@/generated/prisma/client";
import { shopOnboardingSchema } from "@/lib/validation/seller";

export type OnboardingState = { ok?: boolean; error?: string; fieldErrors?: Record<string, string>; values?: Record<string, string> };

const FIELDS = ["name", "slug", "description", "contactEmail", "contactPhone", "legalName", "taxId", "addressLine1", "city", "postalCode"] as const;

/** A customer applies to sell: creates a pending shop and makes them a seller. An admin approves it. */
export async function applyToSellAction(_prev: OnboardingState, formData: FormData): Promise<OnboardingState> {
  const value = String(formData.get("locale") ?? "");
  const locale = hasLocale(routing.locales, value) ? value : routing.defaultLocale;
  const user = await requireUser(locale, `/${locale}/sell`);
  if (user.role === "ADMIN") return { error: "not_allowed" };
  if (user.shop) return { error: "alreadyHasShop" };
  // Echoed back on errors: React resets the form after each submit.
  const values = Object.fromEntries(
    [...FIELDS, "holderName", "bankCode", "branch", "account"].map((f) => [f, String(formData.get(f) ?? "")]),
  );
  if (!(await rateLimit("account", "sell", user.id)).ok) return { error: "rateLimited", values };

  const parsed = shopOnboardingSchema.safeParse({
    ...Object.fromEntries(FIELDS.map((f) => [f, String(formData.get(f) ?? "")])),
    bank: {
      holderName: String(formData.get("holderName") ?? ""),
      bankCode: String(formData.get("bankCode") ?? ""),
      branch: String(formData.get("branch") ?? ""),
      account: String(formData.get("account") ?? ""),
    },
    acceptTerms: formData.get("acceptTerms") === "on",
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path.at(-1))] ??= issue.message;
    return { fieldErrors, values };
  }
  const input = parsed.data;

  try {
    await db.$transaction(async (tx) => {
      await tx.shop.create({
        data: {
          ownerId: user.id,
          name: input.name,
          slug: input.slug,
          description: input.description || null,
          contactEmail: input.contactEmail,
          contactPhone: input.contactPhone,
          legalName: input.legalName,
          taxId: input.taxId,
          businessAddress: { line1: input.addressLine1, city: input.city, postalCode: input.postalCode, country: "IL" },
          payoutBankEncrypted: encryptJson(input.bank),
          payoutBankLast4: input.bank.account.slice(-4),
          status: "PENDING",
        },
      });
      await tx.user.update({ where: { id: user.id }, data: { role: "SELLER" } });
      await tx.auditLog.create({ data: { actorId: user.id, action: "shop.applied", entity: "User", entityId: user.id, meta: { slug: input.slug } } });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return String(error.meta?.target).includes("slug") ? { fieldErrors: { slug: "slugTaken" }, values } : { error: "alreadyHasShop" };
    }
    throw error;
  }
  return { ok: true };
}

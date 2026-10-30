import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/server/db";
import type { Role } from "@/generated/prisma/enums";

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof loadUser>>>;

async function loadUser(id: string) {
  return db.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      locale: true,
      shop: { select: { id: true, name: true, slug: true, status: true } },
    },
  });
}

/**
 * The signed-in user, read fresh from the database once per request.
 * Returns null when signed out, deleted, or suspended.
 */
export const getCurrentUser = cache(async () => {
  const session = await auth();
  if (!session?.user?.id) return null;
  const user = await loadUser(session.user.id);
  if (!user || user.status !== "ACTIVE") return null;
  return user;
});

/** Redirects to sign-in when there is no active user. */
export async function requireUser(locale: string, returnTo?: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    const query = returnTo ? `?callbackUrl=${encodeURIComponent(returnTo)}` : "";
    redirect(`/${locale}/sign-in${query}`);
  }
  return user;
}

/** Redirects to the forbidden page unless the user has one of the roles. */
export async function requireRole(
  roles: readonly Role[],
  locale: string,
  returnTo?: string,
): Promise<CurrentUser> {
  const user = await requireUser(locale, returnTo);
  if (!roles.includes(user.role)) redirect(`/${locale}/forbidden`);
  return user;
}

/** A seller and their shop. Pass `approved` to also require an approved shop. */
export async function requireSeller(locale: string, opts: { approved?: boolean } = {}) {
  const user = await requireRole(["SELLER"], locale, `/${locale}/seller`);
  // A removed shop's owner keeps their account but loses the seller area.
  if (!user.shop || user.shop.status === "REMOVED") redirect(`/${locale}/forbidden`);
  if (opts.approved && user.shop.status !== "APPROVED") redirect(`/${locale}/seller`);
  return { user, shop: user.shop };
}

export const requireAdmin = (locale: string) => requireRole(["ADMIN"], locale, `/${locale}/admin`);

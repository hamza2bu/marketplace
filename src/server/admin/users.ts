import "server-only";
import { db } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import type { Role, UserStatus } from "@/generated/prisma/enums";
import { audit } from "./audit";

export async function listUsers(opts: { q?: string; role?: Role; page: number; pageSize?: number }) {
  const pageSize = opts.pageSize ?? 25;
  const where: Prisma.UserWhereInput = {
    ...(opts.role ? { role: opts.role } : {}),
    ...(opts.q ? { OR: [{ email: { contains: opts.q.toLowerCase() } }, { name: { contains: opts.q, mode: "insensitive" } }] } : {}),
  };
  const [users, total] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (opts.page - 1) * pageSize,
      take: pageSize,
      select: { id: true, email: true, name: true, role: true, status: true, createdAt: true, shop: { select: { name: true } }, _count: { select: { orders: true } } },
    }),
    db.user.count({ where }),
  ]);
  return { users, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Suspends or reactivates an account. Admins can't be suspended from here (including yourself). */
export async function setUserStatus(adminId: string, userId: string, status: UserStatus) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true, status: true } });
  if (!user || user.role === "ADMIN" || userId === adminId) return { ok: false as const };
  await db.user.update({ where: { id: userId }, data: { status } });
  // Signed-in sessions end at their next check (the JWT refresh reads the status).
  await audit(db, adminId, `user.${status.toLowerCase()}`, "User", userId, { from: user.status });
  return { ok: true as const };
}

export async function auditTrail(opts: { entity?: string; page: number; pageSize?: number }) {
  const pageSize = opts.pageSize ?? 50;
  const where: Prisma.AuditLogWhereInput = opts.entity ? { entity: opts.entity } : {};
  const [entries, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (opts.page - 1) * pageSize,
      take: pageSize,
      include: { actor: { select: { email: true } } },
    }),
    db.auditLog.count({ where }),
  ]);
  return { entries, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

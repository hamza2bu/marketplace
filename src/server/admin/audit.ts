import "server-only";
import { db } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";

type Client = Prisma.TransactionClient | typeof db;

/** Every admin action leaves a trail: who, what, on which record. */
export async function audit(client: Client, actorId: string, action: string, entity: string, entityId: string, meta: Prisma.InputJsonValue = {}) {
  await client.auditLog.create({ data: { actorId, action, entity, entityId, meta } });
}

export async function queueEmail(client: Client, to: string, userId: string | null, template: string, payload: Prisma.InputJsonValue) {
  await client.emailLog.create({ data: { to, userId, template, payload, status: "queued" } });
}

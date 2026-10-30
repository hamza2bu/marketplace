import "server-only";
import { after } from "next/server";
import { db } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import { renderEmail } from "./render";

type Client = Prisma.TransactionClient | typeof db;
const MAX_ATTEMPTS = 5;
// Their payload holds a one-time link; it's wiped once the email is sent.
const SENSITIVE = new Set(["password-reset", "verify-email"]);

/**
 * Queues an email in the caller's transaction (so it's only sent if the
 * change it describes commits), and asks for the queue to be flushed once
 * the current request has finished.
 */
export async function queueEmail(client: Client, email: { to: string; userId?: string | null; template: string; payload: Prisma.InputJsonObject }) {
  await client.emailLog.create({ data: { to: email.to, userId: email.userId ?? null, template: email.template, payload: email.payload, status: "queued" } });
  flushAfterResponse();
}

/** Sends queued emails after the response, if we're inside a request. */
export function flushAfterResponse() {
  try {
    after(() => sendQueuedEmails().catch((error) => console.error("[email] flush failed", error)));
  } catch {
    // Outside a request (scripts, tests): the cron job picks them up.
  }
}

type Row = { id: string; to: string; template: string; payload: Record<string, unknown>; userId: string | null; attempts: number };

/**
 * Sends up to `limit` queued (or previously failed) emails. Rows are claimed
 * with SKIP LOCKED, so concurrent runs never send the same email twice.
 */
export async function sendQueuedEmails(limit = 50): Promise<{ sent: number; failed: number }> {
  const rows = await db.$queryRaw<Row[]>`
    UPDATE "EmailLog" SET status = 'sending', attempts = attempts + 1
    WHERE id IN (
      SELECT id FROM "EmailLog"
      WHERE status = 'queued' OR (status = 'failed' AND attempts < ${MAX_ATTEMPTS})
      ORDER BY "createdAt"
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, "to", template, payload, "userId", attempts`;
  if (rows.length === 0) return { sent: 0, failed: 0 };

  const locales = new Map(
    (await db.user.findMany({ where: { id: { in: rows.map((r) => r.userId).filter((id) => id !== null) } }, select: { id: true, locale: true } })).map((u) => [u.id, u.locale]),
  );
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const email = renderEmail(row.template, row.payload, row.userId ? locales.get(row.userId) : null);
      const delivered = await deliver({ to: row.to, ...email });
      await db.emailLog.update({
        where: { id: row.id },
        data: { status: delivered ? "sent" : "logged", sentAt: new Date(), lastError: null, ...(SENSITIVE.has(row.template) ? { payload: { redacted: true } } : {}) },
      });
      sent++;
    } catch (error) {
      failed++;
      await db.emailLog.update({ where: { id: row.id }, data: { status: "failed", lastError: String(error).slice(0, 500) } });
    }
  }
  return { sent, failed };
}

/**
 * Delivers through Resend when RESEND_API_KEY is set. Otherwise (local
 * development) the email is printed to the server log, and false is returned.
 */
async function deliver(email: { to: string; subject: string; html: string; text: string }): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.info(`[email] to=${email.to} subject="${email.subject}"\n${email.text}\n`);
    return false;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM ?? "Shuk <onboarding@resend.dev>", to: email.to, subject: email.subject, html: email.html, text: email.text }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return true;
}

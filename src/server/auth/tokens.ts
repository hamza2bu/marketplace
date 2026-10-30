import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "@/server/db";

// One-time tokens for password reset and email verification, in Auth.js's
// VerificationToken table. Only a SHA-256 hash is stored, so a database leak
// doesn't leak usable links.

export type TokenPurpose = "reset" | "verify";
const LIFETIME_MS: Record<TokenPurpose, number> = { reset: 60 * 60 * 1000, verify: 24 * 60 * 60 * 1000 };

const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const identifier = (purpose: TokenPurpose, email: string) => `${purpose}:${email.toLowerCase()}`;

/** Creates a token (replacing any earlier one for the same purpose and email) and returns it. */
export async function issueToken(purpose: TokenPurpose, email: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await db.$transaction([
    db.verificationToken.deleteMany({ where: { identifier: identifier(purpose, email) } }),
    db.verificationToken.create({ data: { identifier: identifier(purpose, email), token: hash(token), expires: new Date(Date.now() + LIFETIME_MS[purpose]) } }),
  ]);
  return token;
}

/** Checks and consumes a token. True only once, and only before it expires. */
export async function consumeToken(purpose: TokenPurpose, email: string, token: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return false;
  const row = await db.verificationToken.findFirst({ where: { identifier: identifier(purpose, email) } });
  if (!row) return false;
  const a = Buffer.from(row.token, "hex");
  const b = Buffer.from(hash(token), "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  const { count } = await db.verificationToken.deleteMany({ where: { identifier: row.identifier, token: row.token } });
  return count === 1 && row.expires > new Date();
}

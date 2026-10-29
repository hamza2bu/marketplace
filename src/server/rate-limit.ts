import "server-only";
import { headers } from "next/headers";
import { createRateLimiter, type RateLimitResult } from "@/lib/rate-limiter";

// In-memory limiters: fine for one server process. Swap the store for
// Redis/Upstash before running more than one instance.
const limiters = {
  auth: createRateLimiter({ limit: 10, windowMs: 15 * 60 * 1000 }),
  cart: createRateLimiter({ limit: 60, windowMs: 60 * 1000 }),
  checkout: createRateLimiter({ limit: 10, windowMs: 60 * 1000 }),
  account: createRateLimiter({ limit: 30, windowMs: 60 * 1000 }),
};

export async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

/** Counts one attempt for `action` from this IP (and user, when given). */
export async function rateLimit(kind: keyof typeof limiters, action: string, userId?: string): Promise<RateLimitResult> {
  return limiters[kind].hit(`${action}:${userId ?? (await clientIp())}`);
}

/** Limit auth attempts per IP and per action (sign-in, sign-up). */
export async function limitAuthAttempt(action: string): Promise<RateLimitResult> {
  return rateLimit("auth", action);
}

import "server-only";
import { headers } from "next/headers";
import { createRateLimiter, type RateLimitResult } from "@/lib/rate-limiter";

// In-memory limiter: fine for one server process. Swap the store for
// Redis/Upstash before running more than one instance.
const authLimiter = createRateLimiter({ limit: 10, windowMs: 15 * 60 * 1000 });

export async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

/** Limit auth attempts per IP and per action (sign-in, sign-up). */
export async function limitAuthAttempt(action: string): Promise<RateLimitResult> {
  return authLimiter.hit(`${action}:${await clientIp()}`);
}

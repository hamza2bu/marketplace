export type RateLimitResult = { ok: boolean; remaining: number; resetAt: number };

type Options = { limit: number; windowMs: number; now?: () => number };

/** Fixed-window rate limiter backed by a Map. */
export function createRateLimiter({ limit, windowMs, now = Date.now }: Options) {
  const buckets = new Map<string, { count: number; resetAt: number }>();

  function sweep(time: number) {
    if (buckets.size < 10_000) return;
    for (const [key, bucket] of buckets) if (bucket.resetAt <= time) buckets.delete(key);
  }

  return {
    hit(key: string): RateLimitResult {
      const time = now();
      sweep(time);
      let bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= time) {
        bucket = { count: 0, resetAt: time + windowMs };
        buckets.set(key, bucket);
      }
      bucket.count += 1;
      return {
        ok: bucket.count <= limit,
        remaining: Math.max(0, limit - bucket.count),
        resetAt: bucket.resetAt,
      };
    },
    reset(key: string) {
      buckets.delete(key);
    },
  };
}

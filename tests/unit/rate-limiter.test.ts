import { describe, expect, it } from "vitest";
import { createRateLimiter } from "@/lib/rate-limiter";

describe("createRateLimiter", () => {
  it("allows up to the limit, then blocks until the window resets", () => {
    let time = 0;
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000, now: () => time });

    expect(limiter.hit("ip").ok).toBe(true);
    expect(limiter.hit("ip").ok).toBe(true);
    expect(limiter.hit("ip")).toMatchObject({ ok: false, remaining: 0 });

    time = 1000;
    expect(limiter.hit("ip").ok).toBe(true);
  });

  it("tracks keys independently", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000 });
    expect(limiter.hit("a").ok).toBe(true);
    expect(limiter.hit("b").ok).toBe(true);
    expect(limiter.hit("a").ok).toBe(false);
  });
});

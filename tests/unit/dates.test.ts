import { describe, expect, it } from "vitest";
import { parseLocalDateTime, toLocalDateTimeInput } from "@/lib/dates";

describe("Israel local times", () => {
  it("handles winter (UTC+2) and summer (UTC+3) time", () => {
    expect(parseLocalDateTime("2026-12-01T10:00")?.toISOString()).toBe("2026-12-01T08:00:00.000Z");
    expect(parseLocalDateTime("2026-07-01T10:00")?.toISOString()).toBe("2026-07-01T07:00:00.000Z");
  });

  it("round-trips through the input format", () => {
    for (const v of ["2026-03-27T03:30", "2026-10-25T01:30", "2026-01-15T23:59"]) {
      expect(toLocalDateTimeInput(parseLocalDateTime(v)!)).toBe(v);
    }
  });

  it("rejects malformed input", () => {
    expect(parseLocalDateTime("tomorrow")).toBeNull();
    expect(parseLocalDateTime("2026-13-01T10")).toBeNull();
  });
});

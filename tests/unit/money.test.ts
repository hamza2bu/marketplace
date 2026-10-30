import { describe, expect, it } from "vitest";
import { formatMoney, parseMoney } from "@/lib/money";

describe("parseMoney", () => {
  it.each([
    ["129.9", 12990],
    ["129,90", 12990],
    ["5", 500],
    ["0.05", 5],
  ])("parses %s to %i agorot", (input, expected) => {
    expect(parseMoney(input)).toBe(expected);
  });

  it.each(["", "abc", "1.234", "-5", "1e3"])("rejects %j", (input) => {
    expect(parseMoney(input)).toBeNull();
  });
});

describe("formatMoney", () => {
  it("formats agorot as shekels", () => {
    expect(formatMoney(12990, "en")).toBe("₪129.90");
    expect(formatMoney(12990, "he")).toContain("129.90");
    expect(formatMoney(12990, "he")).toContain("₪");
  });
});

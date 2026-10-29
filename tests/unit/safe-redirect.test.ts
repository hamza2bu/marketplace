import { describe, expect, it } from "vitest";
import { safeCallbackPath } from "@/lib/safe-redirect";

describe("safeCallbackPath", () => {
  it("keeps same-site paths", () => {
    expect(safeCallbackPath("/he/account?tab=orders", "/he")).toBe("/he/account?tab=orders");
  });

  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "/he\n", null, 42])(
    "falls back for %j",
    (value) => {
      expect(safeCallbackPath(value, "/he")).toBe("/he");
    },
  );
});

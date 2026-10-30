import { describe, expect, it } from "vitest";
import { signUpSchema } from "@/lib/validation/auth";

const valid = { name: "Dana", email: "  Dana@Example.COM ", password: "secret123" };

describe("signUpSchema", () => {
  it("normalizes the email", () => {
    expect(signUpSchema.parse(valid).email).toBe("dana@example.com");
  });

  it.each([
    [{ password: "short1" }, "passwordTooShort"],
    [{ password: "onlyletters" }, "passwordNeedsNumber"],
    [{ password: "12345678" }, "passwordNeedsLetter"],
    [{ email: "not-an-email" }, "invalidEmail"],
    [{ name: "D" }, "nameTooShort"],
  ])("rejects %j with %s", (override, code) => {
    const result = signUpSchema.safeParse({ ...valid, ...override });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toContain(code);
  });
});

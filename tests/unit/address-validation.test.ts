import { describe, expect, it } from "vitest";
import { addressSchema } from "@/lib/validation/address";

const valid = { fullName: "דנה ישראלי", phone: "050-123 4567", line1: "הרצל 10", city: "תל אביב", postalCode: "6100000" };

describe("addressSchema", () => {
  it("accepts an Israeli address and normalizes the phone", () => {
    const parsed = addressSchema.parse(valid);
    expect(parsed.phone).toBe("0501234567");
    expect(parsed.line2).toBeUndefined();
  });

  it.each(["+972501234567", "03-1234567", "077-1234567"])("accepts phone %s", (phone) => {
    expect(addressSchema.safeParse({ ...valid, phone }).success).toBe(true);
  });

  it.each([
    [{ phone: "12345" }, "invalidPhone"],
    [{ postalCode: "12345" }, "invalidPostalCode"],
    [{ city: "  " }, "required"],
  ])("rejects %j", (override, code) => {
    const result = addressSchema.safeParse({ ...valid, ...override });
    expect(result.error?.issues[0]?.message).toBe(code);
  });
});

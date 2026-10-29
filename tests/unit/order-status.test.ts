import { describe, expect, it } from "vitest";
import { deriveOrderStatus, generateOrderNumber, returnWindow } from "@/lib/order-status";

describe("deriveOrderStatus", () => {
  it("leaves unpaid orders alone", () => {
    expect(deriveOrderStatus("PENDING_PAYMENT", ["PENDING"], false)).toBe("PENDING_PAYMENT");
    expect(deriveOrderStatus("CANCELLED", ["CANCELLED"], false)).toBe("CANCELLED");
  });

  it("follows fulfilment across sellers", () => {
    expect(deriveOrderStatus("PAID", ["PAID", "PROCESSING"], false)).toBe("PAID");
    expect(deriveOrderStatus("PAID", ["SHIPPED", "PROCESSING"], false)).toBe("PARTIALLY_FULFILLED");
    expect(deriveOrderStatus("PAID", ["DELIVERED", "DELIVERED"], false)).toBe("COMPLETED");
  });

  it("handles cancellations and refunds", () => {
    expect(deriveOrderStatus("PAID", ["REFUNDED", "CANCELLED"], true)).toBe("REFUNDED");
    expect(deriveOrderStatus("PAID", ["CANCELLED", "PROCESSING"], true)).toBe("PARTIALLY_REFUNDED");
    expect(deriveOrderStatus("PAID", ["CANCELLED", "DELIVERED"], true)).toBe("COMPLETED");
  });
});

describe("generateOrderNumber", () => {
  it("has a date and an unambiguous suffix", () => {
    const n = generateOrderNumber(new Date("2026-10-30T12:00:00Z"));
    expect(n).toMatch(/^MP-261030-[A-HJ-NP-Z2-9]{6}$/);
  });
});

describe("returnWindow", () => {
  const deliveredAt = new Date("2026-10-01T10:00:00Z");
  it("is open for the configured days after delivery", () => {
    expect(returnWindow({ status: "DELIVERED", deliveredAt }, 14, new Date("2026-10-14T10:00:00Z"))).toEqual({
      until: new Date("2026-10-15T10:00:00Z"),
      canReturn: true,
    });
    expect(returnWindow({ status: "DELIVERED", deliveredAt }, 14, new Date("2026-10-16T00:00:00Z")).canReturn).toBe(false);
  });
  it("is closed when not delivered or already returning", () => {
    expect(returnWindow({ status: "SHIPPED", deliveredAt: null }, 14, deliveredAt).canReturn).toBe(false);
    expect(returnWindow({ status: "RETURN_REQUESTED", deliveredAt }, 14, deliveredAt).canReturn).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { renderEmail } from "@/server/email/render";

describe("renderEmail", () => {
  it("renders in the recipient's language and direction, with a button to the order", () => {
    const email = renderEmail("order-shipped", { orderNumber: "MP-1", trackingNumber: "RR1IL" }, "he");
    expect(email.subject).toBe("חלק מהזמנה MP-1 נשלח");
    expect(email.html).toContain('dir="rtl"');
    expect(email.html).toContain("/he/account/orders/MP-1");
    expect(email.text).toContain("RR1IL");
  });

  it("formats money and falls back to Hebrew for unknown locales", () => {
    expect(renderEmail("refund-issued", { orderNumber: "MP-2", amountMinor: 2500 }, "fr").text).toContain("25.00");
    expect(renderEmail("refund-issued", { orderNumber: "MP-2", amountMinor: 2500 }, "en").subject).toBe("Refund for order MP-2");
  });

  it("escapes values from the payload", () => {
    const email = renderEmail("dispute-resolved", { resolution: '<script>alert("x")</script>' }, "en");
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
  });

  it("refuses unknown templates", () => {
    expect(() => renderEmail("nope", {}, "en")).toThrow();
  });
});

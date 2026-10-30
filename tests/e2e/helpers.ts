import path from "node:path";
import { expect, type Page } from "@playwright/test";

export const ACCOUNTS = {
  customer: "customer@example.com",
  seller: "seller.home@example.com",
  admin: "admin@example.com",
} as const;

export const statePath = (role: keyof typeof ACCOUNTS) => path.join(__dirname, ".auth", `${role}.json`);

/** Adds the product (default variant) to the cart from its page. */
export async function addToCart(page: Page, slug: string) {
  await page.goto(`/en/p/${slug}`);
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Added to your cart" })).toBeVisible();
}

/** Places the order with the customer's saved address and approves the test payment. Returns the order number. */
export async function checkoutAndPay(page: Page, outcome: "approve" | "decline" = "approve") {
  await page.goto("/en/checkout");
  if ((await page.locator("input[name=addressId]").count()) === 0) {
    await page.fill("#fullName", "Dana Israeli");
    await page.fill("#phone", "0501234567");
    await page.fill("#line1", "Herzl 1");
    await page.fill("#city", "Tel Aviv");
    await page.fill("#postalCode", "6100000");
    await page.getByRole("button", { name: "Save address" }).click();
    await expect(page.locator("input[name=addressId]").first()).toBeVisible();
  }
  await page.getByRole("button", { name: /Place order and pay/ }).click();
  await page.waitForURL("**/pay/test/**");
  await page.getByRole("button", { name: outcome === "approve" ? "Approve payment" : "Decline payment" }).click();
  await page.waitForURL("**/checkout/complete?order=*");
  return new URL(page.url()).searchParams.get("order")!;
}

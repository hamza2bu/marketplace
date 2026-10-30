import { expect, test } from "@playwright/test";
import { addToCart, checkoutAndPay, statePath } from "./helpers";

// One order through its whole life: bought by the customer, shipped and
// delivered by the seller, then reviewed by the customer.
test.describe.serial("order journey", () => {
  let orderNumber: string;
  const product = "handmade-ceramic-vase"; // sold by Bayit Design (seller.home@example.com)

  test("customer buys from two shops in one payment", async ({ browser }) => {
    const page = await (await browser.newContext({ storageState: statePath("customer") })).newPage();
    await addToCart(page, product);
    await addToCart(page, "baseball-cap");
    await page.goto("/en/cart");
    await expect(page.getByText("Sold and shipped by Bayit Design")).toBeVisible();
    await expect(page.getByText("Sold and shipped by Urban Wear")).toBeVisible();

    orderNumber = await checkoutAndPay(page);
    await expect(page.getByRole("heading", { name: "Thank you for your order!" })).toBeVisible();
    await page.getByRole("link", { name: "View order" }).click();
    // One status line per shop's shipment.
    await expect(page.locator("main section header").filter({ hasText: "Payment confirmed" })).toHaveCount(2);
  });

  test("a declined payment cancels the order and keeps the cart", async ({ browser }) => {
    const page = await (await browser.newContext({ storageState: statePath("customer") })).newPage();
    await addToCart(page, "silk-scarf");
    await checkoutAndPay(page, "decline");
    await expect(page.getByRole("heading", { name: "Payment didn't go through" })).toBeVisible();
    await page.goto("/en/cart");
    await expect(page.getByRole("link", { name: "צעיף משי" }).first()).toBeVisible();
    // Leave the cart empty for the next tests.
    await page.getByRole("button", { name: "Remove" }).click();
  });

  test("seller prepares, ships with tracking and delivers", async ({ browser }) => {
    const page = await (await browser.newContext({ storageState: statePath("seller") })).newPage();
    await page.goto("/en/seller/orders?status=PAID");
    await page.getByRole("link", { name: orderNumber }).click();
    await page.getByRole("button", { name: "Start preparing" }).click();
    await page.locator("select[name=carrier]").selectOption("israel-post");
    await page.fill("input[name=trackingNumber]", "RR987654321IL");
    await page.getByRole("button", { name: "Mark as shipped" }).click();
    await page.getByRole("button", { name: "Mark as delivered" }).click();
    await expect(page.getByText(/Your money is released on/)).toBeVisible();
  });

  test("customer sees tracking and reviews the delivered item", async ({ browser }) => {
    const page = await (await browser.newContext({ storageState: statePath("customer") })).newPage();
    await page.goto(`/en/account/orders/${orderNumber}`);
    await expect(page.getByText("RR987654321IL")).toBeVisible();
    await page.getByText("Write a review").click();
    // The visible star; its "5 stars" text is for screen readers.
    await page.locator("label", { hasText: "5 stars" }).click();
    await page.fill("textarea[name=body]", "Beautiful vase, arrived well packed.");
    await page.getByRole("button", { name: "Publish review" }).click();
    await expect(page.getByText("Edit your review")).toBeVisible();

    await page.goto(`/en/p/${product}`);
    // .first(): re-running the suite adds the same review again.
    await expect(page.getByText("Beautiful vase, arrived well packed.").first()).toBeVisible();
  });
});

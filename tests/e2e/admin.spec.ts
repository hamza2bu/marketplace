import { expect, test } from "@playwright/test";
import { statePath } from "./helpers";

test.describe("admin and access control", () => {
  test("customers and sellers can't open the admin panel", async ({ browser }) => {
    for (const role of ["customer", "seller"] as const) {
      const page = await (await browser.newContext({ storageState: statePath(role) })).newPage();
      await page.goto("/en/admin");
      await expect(page).toHaveURL(/\/en\/forbidden$/);
    }
  });

  test("signed-out visitors are sent to sign in", async ({ page }) => {
    await page.goto("/en/seller");
    await expect(page).toHaveURL(/\/en\/sign-in\?callbackUrl=%2Fen%2Fseller/);
  });

  test("a new seller applies and an admin approves the shop", async ({ page, browser }) => {
    const stamp = Date.now();
    await page.goto("/en/sign-up");
    await page.fill("#name", "E2E Seller");
    await page.fill("#email", `e2e-seller-${stamp}@example.com`);
    await page.fill("#password", "e2eseller123");
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL("**/en/account");

    await page.goto("/en/sell");
    const fields: Record<string, string> = {
      name: `E2E Shop ${stamp}`, slug: `e2e-shop-${stamp}`, contactPhone: "0525551234", legalName: "E2E Ltd", taxId: "515000024",
      addressLine1: "Main 1", city: "Haifa", postalCode: "3100000", holderName: "E2E Ltd", bankCode: "12", branch: "600", account: "123456",
    };
    for (const [name, value] of Object.entries(fields)) await page.fill(`#${name}`, value);
    await page.getByLabel(/I agree to the seller terms/).check();
    await page.getByRole("button", { name: "Send application" }).click();
    await page.waitForURL("**/en/seller");
    await expect(page.getByText(/waiting for admin approval/)).toBeVisible();

    const admin = await (await browser.newContext({ storageState: statePath("admin") })).newPage();
    await admin.goto("/en/admin/shops?status=PENDING");
    await admin.getByRole("link", { name: `E2E Shop ${stamp}` }).click();
    await admin.getByRole("button", { name: "Approve shop" }).click();
    await expect(admin.getByText("Approved", { exact: true })).toBeVisible();
    expect((await admin.request.get(`/en/s/e2e-shop-${stamp}`)).status()).toBe(200);
  });

  test("revenue report renders and exports CSV", async ({ browser }) => {
    const page = await (await browser.newContext({ storageState: statePath("admin") })).newPage();
    await page.goto("/en/admin/reports?days=90");
    await expect(page.locator("main figure svg")).toHaveCount(2);
    const csv = await (await page.request.get("/api/admin/report?days=90")).text();
    expect(csv).toContain("SEED-");
  });

  test("forgot password never reveals whether an account exists", async ({ page }) => {
    for (const email of ["customer@example.com", "nobody-here@example.com"]) {
      await page.goto("/en/forgot-password");
      await page.fill("#email", email);
      await page.getByRole("button", { name: "Send reset link" }).click();
      await expect(page.getByText(/If an account exists for that email/)).toBeVisible();
    }
  });
});

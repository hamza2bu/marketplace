import { expect, test } from "@playwright/test";

test.describe("browsing", () => {
  test("visitors are sent to their browser's language", async ({ browser }) => {
    for (const [locale, path] of [["he-IL", "/he"], ["ar", "/ar"], ["en-US", "/en"]]) {
      const page = await (await browser.newContext({ locale })).newPage();
      await page.goto("/");
      await expect(page).toHaveURL(new RegExp(`${path}$`));
    }
  });

  test("Hebrew home page is right-to-left, with categories and products", async ({ page }) => {
    await page.goto("/he");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("navigation", { name: "קטגוריות" }).getByRole("link", { name: "אלקטרוניקה" })).toBeVisible();
    await expect(page.locator("main article").first()).toBeVisible();
  });

  test("search finds Hebrew words by prefix and filters narrow results", async ({ page }) => {
    await page.goto("/en/search?q=" + encodeURIComponent("סוללה נייד"));
    await expect(page.getByRole("link", { name: "סוללה ניידת 20000mAh" })).toBeVisible();

    await page.goto("/en/c/electronics");
    await expect(page.getByText("10 products")).toBeVisible();
    await page.getByRole("checkbox", { name: /VoltPro/ }).check();
    await expect(page).toHaveURL(/brand=voltpro/);
    await expect(page.getByText("3 products")).toBeVisible();
  });

  test("product page: variants change price, structured data is present", async ({ page }) => {
    await page.goto("/en/p/living-room-rug");
    await expect(page.getByText("₪499.90").first()).toBeVisible();
    await page.getByRole("button", { name: "160×230" }).click();
    await expect(page.getByText("₪699.90").first()).toBeVisible();
    const jsonLd = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(jsonLd.some((s) => s.includes('"@type":"Product"'))).toBe(true);
  });

  test("seeded reviews show on product pages", async ({ page }) => {
    await page.goto("/en/search?sort=rating");
    await page.locator("main article a").first().click();
    await expect(page.getByRole("heading", { name: "Customer reviews" })).toBeVisible();
    await expect(page.getByText("Verified buyer").first()).toBeVisible();
  });

  test("missing pages return 404", async ({ request }) => {
    expect((await request.get("/en/p/does-not-exist")).status()).toBe(404);
    expect((await request.get("/en/nothing-here")).status()).toBe(404);
  });
});

import { chromium, type FullConfig } from "@playwright/test";
import { ACCOUNTS, statePath } from "./helpers";

/** Signs in once per seeded role and saves the session for the tests to reuse. */
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL!;
  const browser = await chromium.launch();
  for (const [role, email] of Object.entries(ACCOUNTS)) {
    const page = await browser.newPage({ baseURL });
    await page.goto("/en/sign-in");
    await page.fill("#email", email);
    await page.fill("#password", process.env.SEED_PASSWORD ?? "Password123!");
    await page.click("main button[type=submit]");
    await page.waitForURL("**/en/account");
    await page.context().storageState({ path: statePath(role as keyof typeof ACCOUNTS) });
    await page.close();
  }
  await browser.close();
}

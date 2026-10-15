import { expect } from "@playwright/test";

export async function openWritingShop(page) {
  await expect(page.locator("#writing-coins.is-closing")).toHaveCount(0);
  if (await page.locator("#writing-shop").count()) return;
  if (!(await page.locator("#writing-coins").count()))
    await page.locator(".writing-timer-balance").click();
  await page
    .getByRole("button", { name: /^(Открыть магазин|Open shop)$/ })
    .click();
  await expect(page.locator("#writing-coins > #writing-shop")).toBeVisible();
}

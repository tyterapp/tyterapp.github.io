import { expect } from "@playwright/test";

export async function selectAppOption(page, control, value) {
  await control.click();
  const menu = page.getByRole("listbox");
  await expect(menu).toBeVisible();
  await menu.locator(`[role="option"][data-value="${value}"]`).click();
  await expect(menu).toHaveCount(0);
}

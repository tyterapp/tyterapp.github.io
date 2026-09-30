import { test, expect } from "@playwright/test";
test("landing offers a browser trial, web Pro, outline and TYT, without installers", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Сценарий без хаоса" }),
  ).toBeVisible();
  await expect(page.locator(".landing-brand img")).toHaveAttribute(
    "src",
    "/brand/tyter-logo.svg",
  );
  await expect(page.locator("#pro")).toContainText(
    "2 документа и 10 компонентов",
  );
  await expect(page.locator("#pro")).toContainText("без ограничений");
  await expect(page.locator("#pro")).toContainText("TYT");
  await expect(page.locator("#pro")).toContainText("Аутлайн");
  await expect(page.locator("a[download]")).toHaveCount(0);
  await expect(page.locator('a[href*=".exe"], a[href*=".dmg"]')).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Купить PRO", exact: true }).first(),
  ).toBeVisible();
  await expect(page.locator("#download")).toContainText("доната");
  await page.getByRole("link", { name: "Попробовать", exact: true }).click();
  await expect(page).toHaveURL(/\/free$/);
  await expect(
    page.getByRole("textbox", { name: "Screenplay editor" }),
  ).toBeVisible();
});
test("the free editor keeps its route and the old payment route leads to Pro", async ({
  page,
}) => {
  await page.goto("/pay");
  await expect(page).toHaveURL(/\/pro$/);
  await expect(page.getByRole("heading", { name: "Вход в Pro" })).toBeVisible();
  await page.goto("/free");
  await expect(page).toHaveURL(/\/free$/);
  await expect(
    page.getByRole("textbox", { name: "Screenplay editor" }),
  ).toBeVisible();
});
test("landing is usable on mobile without horizontal overflow", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "Попробовать", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: info.outputPath("landing-mobile.png"),
    fullPage: true,
  });
});

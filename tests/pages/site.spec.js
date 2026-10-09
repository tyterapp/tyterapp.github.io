import { test, expect } from "@playwright/test";
import { parseProAccessList } from "../../src/pro-access.js";

test("Pages serves the landing and direct editor routes without an API", async ({
  page,
  request,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Сценарий без хаоса" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Попробовать", exact: true }),
  ).toHaveAttribute("href", "/free");
  for (const route of ["/free", "/free/", "/app/"]) {
    await page.goto(route);
    await expect(
      page.getByRole("textbox", { name: "Screenplay editor" }),
    ).toBeVisible();
    if (route.startsWith("/free")) await expect(page).toHaveURL(/\/free\/?$/);
    await page.reload();
    await expect(
      page.getByRole("textbox", { name: "Screenplay editor" }),
    ).toBeVisible();
  }
  for (const route of ["/beta", "/beta/", "/pro/"]) {
    const response = await page.goto(route);
    expect(response.status()).toBe(200);
    await expect(
      page.getByRole("heading", { name: "Вход в Pro" }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Вход в Pro" }),
    ).toBeVisible();
  }
  const codes = await request.get("/codes-for-pro.txt");
  expect(codes.status()).toBe(200);
  expect(codes.headers()["content-type"]).toContain("text/plain");
  const published = await codes.text();
  expect(parseProAccessList(published).version).toBe(1);
  expect(published).not.toContain("@");
  expect(published).not.toMatch(/\[[A-Za-z0-9]{6}\]\[/);
  expect((await request.get("/api/pro/session")).status()).toBe(404);
  expect((await request.post("/api/pro/session", { data: {} })).status()).toBe(
    405,
  );
  expect(errors).toEqual([]);
});

test("Pages serves the 404 route and uses the same page for unknown URLs", async ({
  page,
  request,
}, testInfo) => {
  for (const route of [
    "/404",
    "/404/",
    "/404.html",
    "/missing-page",
    "/missing/nested-page",
  ]) {
    const response = await page.goto(route);
    expect(response.status()).toBe(route.startsWith("/404") ? 200 : 404);
    await expect(
      page.getByRole("heading", { name: "404", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Страница не найдена" }),
    ).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      "noindex",
    );
    await expect(
      page.getByRole("link", { name: "Бесплатная версия", exact: true }),
    ).toHaveAttribute("href", "/free");
  }
  const head = await request.head("/missing-page");
  expect(head.status()).toBe(404);
  expect(head.headers()["content-type"]).toContain("text/html");
  expect((await head.body()).length).toBe(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/404/");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath("not-found-mobile.png") });
  await page.getByRole("link", { name: "На главную", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Сценарий без хаоса" }),
  ).toBeVisible();
});

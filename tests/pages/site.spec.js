import { test, expect } from "@playwright/test";
import { parseProAccessList } from "../../src/pro-access.js";
import { readFile } from "node:fs/promises";

test("social previews and route-specific SEO exist in the static HTML without JavaScript", async ({
  request,
}) => {
  for (const [route, title] of [
    ["/", "Tyter — сценарий без хаоса"],
    ["/b", "Tyter PRO — 600 ₽ в месяц"],
    ["/help", "Помощь Tyter"],
    ["/blog", "Блог Tyter — о сценариях и работе с историей"],
    ["/blog/standarty-v-kino", "Сценарный формат: с чего начать — Tyter"],
  ]) {
    const response = await request.get(route);
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toContain(`<title>${title}</title>`);
    expect(html).toMatch(
      new RegExp(`<meta\\s+property="og:title"\\s+content="${title}"`),
    );
    expect(html).toMatch(
      new RegExp(
        `<link\\s+rel="canonical"\\s+href="https://tyterapp.github.io${route}"`,
      ),
    );
    expect(html).toMatch(
      /property="og:image"\s+content="https:\/\/tyterapp.github.io\/brand\/tyter-social-cover.png"/,
    );
    expect(html).toMatch(/name="twitter:card"\s+content="summary_large_image"/);
    const description = html.match(/name="description"\s+content="([^"]+)"/)[1];
    expect(html.match(/property="og:description"\s+content="([^"]+)"/)[1]).toBe(
      description,
    );
  }
  const cover = await request.get("/brand/tyter-social-cover.png");
  expect(cover.status()).toBe(200);
  const bytes = await cover.body();
  expect(
    bytes.equals(
      await readFile(
        new URL("../../public/brand/tyter-social-cover.png", import.meta.url),
      ),
    ),
  ).toBe(true);
  expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([
    2400, 1260,
  ]);
  expect(await (await request.get("/robots.txt")).text()).toContain(
    "Sitemap: https://tyterapp.github.io/sitemap.xml",
  );
  expect(await (await request.get("/sitemap.xml")).text()).toContain(
    "<loc>https://tyterapp.github.io/b</loc>",
  );
});

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
    page
      .getByRole("link", { name: "Попробовать бесплатно", exact: true })
      .first(),
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

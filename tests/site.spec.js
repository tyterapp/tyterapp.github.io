import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  await page.addInitScript(() =>
    localStorage.setItem("tyter.onboarding.v1", "done"),
  );
});

test("landing keeps the left panel fixed, offers the correct routes and ends with the annual comparison", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1735, height: 1081 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Сценарий без хаоса" }),
  ).toBeVisible();
  await expect(page.locator(".site-logo img")).toHaveAttribute(
    "src",
    "/brand/landing-logo.svg",
  );
  await expect(
    page.getByRole("link", { name: "Tyter — главная", exact: true }),
  ).toHaveAttribute("href", "/");
  await expect(
    page.getByRole("link", { name: "Блог", exact: true }),
  ).toHaveAttribute("href", "/blog");
  await expect(
    page.getByRole("link", { name: "Помощь", exact: true }),
  ).toHaveAttribute("href", "/help");
  await expect(
    page.getByRole("link", {
      name: "Чат бета-тестеров в Телеграме",
      exact: true,
    }),
  ).toHaveAttribute("href", "https://t.me/ultraproduct");
  for (const link of await page
    .getByRole("link", { name: "Купить PRO", exact: true })
    .all())
    await expect(link).toHaveAttribute("href", "/pro");
  await page.screenshot({ path: ".cache/landing-desktop-light.png" });
  const before = await page.locator(".site-fixed").boundingBox();
  const feed = page.locator(".site-feed");
  await feed.hover();
  await page.mouse.wheel(0, 1200);
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(500);
  const after = await page.locator(".site-fixed").boundingBox();
  expect(after).toEqual(before);
  expect(await feed.evaluate((node) => node.scrollTop)).toBe(0);
  await page.locator(".site-comparison").scrollIntoViewIfNeeded();
  await expect(
    page.getByRole("table", { name: "Сравнение Free и PRO" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Купить PRO за 2000 ₽ в год", exact: true }),
  ).toHaveAttribute("href", "/pro");
  await expect(page.locator(".site-comparison")).toContainText(
    "Без ограничений",
  );
  await expect(page.locator(".site-comparison")).toContainText("TYT");
  await expect(page.locator(".site-plan-group")).toHaveCount(5);
  for (const feature of [
    "Девять цветных версий и копии сценария",
    "Свойства кадра: формат, оптика, план, ракурс, композиция и свет",
    "Дата съёмки и локация на карте с координатами",
    "Доктор сценария: проверка формата и отключаемые мухи",
    "Зажигалка: многократное сжигание последней страницы",
  ])
    await expect(
      page.getByRole("rowheader", { name: feature, exact: true }),
    ).toHaveCount(1);
  const doctor = page
    .getByRole("rowheader", {
      name: "Доктор сценария: проверка формата и отключаемые мухи",
      exact: true,
    })
    .locator("..");
  await expect(doctor.locator("td")).toHaveText(["20 монет", "20 монет"]);
  await page.screenshot({ path: ".cache/landing-annual-plans.png" });
  expect(errors).toEqual([]);
  await page
    .getByRole("link", { name: "Попробовать бесплатно", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/free\/?$/);
  await expect(
    page.getByRole("textbox", { name: "Screenplay editor" }),
  ).toBeVisible();
  await expect(page.locator(".site-shell")).toHaveCount(0);
});

test("the monthly landing links both purchase buttons and the price to Boosty", async ({
  page,
}) => {
  expect((await page.goto("/b")).status()).toBe(200);
  const buys = page.getByRole("link", { name: "Купить PRO", exact: true });
  await expect(buys).toHaveCount(2);
  for (const link of await buys.all()) {
    await expect(link).toHaveAttribute(
      "href",
      "https://boosty.to/sergeybuharev",
    );
    await expect(link).toHaveAttribute("target", "_blank");
  }
  const price = page.getByRole("link", {
    name: "Купить PRO за 600 ₽ в месяц",
    exact: true,
  });
  await expect(price).toHaveAttribute(
    "href",
    "https://boosty.to/sergeybuharev",
  );
  await expect(page.locator(".site-price-value")).toHaveText("600 ₽");
  await expect(page.locator(".site-comparison")).not.toContainText("2000");
  await expect(page.locator(".site-logo img")).toHaveAttribute(
    "src",
    "/brand/landing-logo.svg",
  );
});

test("theme and language persist across landing routes, and the editor logo is unchanged", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Включить тёмную тему", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "ENG", exact: true }).click();
  await expect(page.locator("h1")).toHaveText("Screenwriting without chaos");
  await expect(page.locator(".site-shell")).not.toContainText(/[А-Яа-яЁё]/);
  await page.screenshot({ path: ".cache/landing-desktop-dark.png" });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("h1")).toHaveText("Screenwriting without chaos");
  await page.goto("/b");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".site-price-period")).toHaveText("per month");
  await page
    .getByRole("button", { name: "Switch to light theme", exact: true })
    .click();
  await page.goto("/free");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator('img[src="/brand/landing-logo.svg"]')).toHaveCount(
    0,
  );
  await expect(page.locator(".screenplay-editor")).toBeVisible();
});

test("blog categories filter articles and stay at the upper right while scrolling; article routes reload", async ({
  page,
}) => {
  expect((await page.goto("/blog")).status()).toBe(200);
  const categories = page.getByRole("navigation", {
    name: "Категории блога",
    exact: true,
  });
  await expect(page.locator(".blog-card")).toHaveCount(3);
  const before = await categories.boundingBox();
  await page.locator(".site-feed").hover();
  await page.mouse.wheel(0, 800);
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(500);
  const after = await categories.boundingBox();
  expect(Math.abs(before.y - after.y)).toBeLessThan(2);
  await page.screenshot({ path: ".cache/blog-sticky.png" });
  await categories
    .getByRole("button", { name: "Сценарный формат", exact: true })
    .click();
  await expect(page.locator(".blog-card")).toHaveCount(1);
  await page
    .getByRole("link", { name: /Сценарный формат: с чего начать/ })
    .click();
  await expect(page).toHaveURL(/\/blog\/standarty-v-kino\/?$/);
  await expect(page.locator(".blog-article")).toContainText("Почему Courier");
  expect((await page.reload()).status()).toBe(200);
  await expect(page.locator(".blog-article")).toBeVisible();
  await expect(page.locator(".site-logo img")).toHaveAttribute(
    "src",
    "/brand/tyter-logo.svg",
  );
  await categories
    .getByRole("link", { name: "Работа в Tyter", exact: true })
    .click();
  await expect(page.locator(".blog-card")).toHaveCount(2);
  await page.getByRole("button", { name: "ENG", exact: true }).click();
  await expect(page.locator(".site-shell")).not.toContainText(/[А-Яа-яЁё]/);
});

test("help is a real page with the chat link and expandable answers", async ({
  page,
}) => {
  expect((await page.goto("/help")).status()).toBe(200);
  await expect(page.locator("h1")).toHaveText("Помощь рядом");
  await expect(
    page.getByRole("link", { name: "Открыть чат", exact: true }),
  ).toHaveAttribute("href", "https://t.me/ultraproduct");
  const offline = page
    .locator("details")
    .filter({ hasText: "Можно работать без интернета?" });
  await offline.locator("summary").click();
  await expect(offline.locator("p")).toBeVisible();
  await page.reload();
  await expect(page.locator(".help-contact")).toBeVisible();
  await page.getByRole("button", { name: "ENG", exact: true }).click();
  await expect(page.locator(".site-shell")).not.toContainText(/[А-Яа-яЁё]/);
});

test("the free editor keeps its route and the old payment route leads to beta", async ({
  page,
}) => {
  await page.goto("/pay");
  await expect(page).toHaveURL(/\/beta\/?$/);
  await expect(page.getByRole("heading", { name: "Вход в Pro" })).toBeVisible();
  await page.goto("/free");
  await expect(page).toHaveURL(/\/free\/?$/);
  await expect(
    page.getByRole("textbox", { name: "Screenplay editor" }),
  ).toBeVisible();
});

test("landing and blog remain usable on narrow screens without horizontal overflow", async ({
  page,
}) => {
  for (const width of [320, 390, 832, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    for (const route of ["/", "/b", "/blog", "/help"]) {
      await page.goto(route);
      await expect(page.locator(".site-nav")).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page
      .getByRole("link", { name: "Попробовать бесплатно", exact: true })
      .first(),
  ).toBeVisible();
  await page.screenshot({ path: ".cache/landing-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/b");
  await page.locator(".site-comparison").scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
  await expect(
    page.getByRole("link", {
      name: "Купить PRO за 600 ₽ в месяц",
      exact: true,
    }),
  ).toBeVisible();
});

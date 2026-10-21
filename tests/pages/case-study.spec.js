import { test, expect } from "@playwright/test";

test.beforeEach(async ({ context }) => {
  await context.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
});
async function seed(page, theme = "light") {
  await page.addInitScript((theme) => {
    localStorage.setItem("tyter.language.v1", "ru");
    localStorage.setItem(
      "tyter.editor-preferences.v1",
      JSON.stringify({ theme }),
    );
    window.caseMotion = [];
    const original = Element.prototype.animate;
    Element.prototype.animate = function (frames, options) {
      if (this.closest(".case-reveal"))
        window.caseMotion.push({
          text: this.closest("[data-emotional-block]")?.getAttribute(
            "aria-label",
          ),
          duration: options.duration,
        });
      return original.call(this, frames, options);
    };
  }, theme);
}

test("case has its own static route, social metadata and sitemap entry", async ({
  request,
}) => {
  for (const route of ["/case", "/case/"]) {
    const response = await request.get(route);
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toContain(
      "<title>Tyter — продуктовый кейс: от текста к кадру</title>",
    );
    expect(html).toContain(
      'rel="canonical" href="https://tyterapp.github.io/case"',
    );
    expect(html).toContain(
      'property="og:title" content="Tyter — продуктовый кейс: от текста к кадру"',
    );
    expect(html).not.toContain('content="noindex"');
  }
  expect(await (await request.get("/sitemap.xml")).text()).toContain(
    "<loc>https://tyterapp.github.io/case</loc>",
  );
});

for (const theme of ["light", "dark"])
  test(`${theme}: case documents three versions and separates planned metrics; headings animate only after scrolling`, async ({
    page,
  }, info) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await seed(page, theme);
    await page.goto("/case");
    await expect(page.locator(".case-study")).toBeVisible();
    await expect(page.locator(".site-nav a[href='/case']")).toHaveCount(0);
    await expect(page.locator(".case-timeline li")).toHaveCount(3);
    await expect(page.locator(".case-version")).toHaveText([
      "1.0",
      "2.0",
      "3.0",
    ]);
    await expect(page.locator(".case-metric")).toHaveCount(3);
    await expect(page.locator(".case-metric-value")).toHaveText([
      "—%",
      "—",
      "— ₽",
    ]);
    expect(await page.evaluate(() => window.caseMotion)).toEqual([]);
    await expect(page.locator("h1")).toHaveText("От строки к кадру");
    await page.screenshot({ path: info.outputPath(`case-${theme}.png`) });
    await page.mouse.wheel(0, 550);
    await expect
      .poll(() => page.evaluate(() => window.caseMotion.length))
      .toBeGreaterThan(0);
    const headings = page.locator(".case-study h2");
    for (let index = 0; index < (await headings.count()); index++) {
      await headings.nth(index).scrollIntoViewIfNeeded();
      await expect(
        headings
          .nth(index)
          .locator("xpath=ancestor::div[contains(@class,'case-reveal')]")
          .last(),
      ).toHaveAttribute("data-revealed", "true");
    }
    await expect(
      page.locator(".case-study p:not(.case-metric-value) .emotional-unit"),
    ).toHaveCount(0);
    const motion = await page.evaluate(() => window.caseMotion);
    expect(
      motion.every((entry) => Math.abs(entry.duration - 680 / 1.4) < 0.01),
    ).toBe(true);
    await page.locator("#brand").scrollIntoViewIfNeeded();
    await expect(page.locator(".case-brand-visual")).toBeVisible();
    await expect(page.locator(".case-shapes .script-version-icon")).toHaveCount(
      9,
    );
    await page.screenshot({ path: info.outputPath(`case-brand-${theme}.png`) });
    expect(errors).toEqual([]);
    await page.getByRole("button", { name: "ENG", exact: true }).click();
    await expect(page.locator("h1")).toHaveAttribute(
      "aria-label",
      "From a line to a frame",
    );
    await expect(page.locator(".case-timeline h3")).toHaveText([
      "Screenplay",
      "Outline",
      "Storyboards",
    ]);
    await expect(page.locator(".site-nav a[href='/case']")).toHaveCount(0);
  });

for (const width of [320, 390])
  test(`case remains readable at ${width}px without horizontal overflow`, async ({
    page,
  }, info) => {
    await seed(page);
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/case/");
    await expect(page.locator(".case-study")).toBeVisible();
    for (const id of [
      "challenge",
      "versions",
      "brand",
      "metrics-conversion",
      "metrics-product",
      "metrics-marketing",
      "next",
    ]) {
      await page.locator(`#${id}`).scrollIntoViewIfNeeded();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
    }
    await page.locator("#metrics-conversion").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: info.outputPath(`case-metric-${width}.png`),
    });
    await page.locator("#brand").scrollIntoViewIfNeeded();
    await expect(page.locator(".case-brand-visual")).toBeVisible();
  });

test("reduced motion keeps all case text visible without text or skeleton animations", async ({
  page,
}) => {
  await seed(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/case");
  await expect(page.locator(".case-study")).toBeVisible();
  await page.locator("#metrics-product").scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => window.caseMotion)).toEqual([]);
  await expect(page.locator("#metrics-product h2")).toHaveText("Продукт");
  await expect(
    page.locator("#metrics-product .case-metric-value"),
  ).toBeVisible();
  expect(
    await page
      .locator(".case-study")
      .evaluate((node) => node.getAnimations({ subtree: true }).length),
  ).toBe(0);
});

test("logo context menu prefetches the case route on intent and opens it in a new tab", async ({
  page,
}) => {
  await seed(page);
  const requests = [];
  page.on("request", (request) => {
    if (/\/assets\/CasePage-[^/]+\.js/.test(request.url()))
      requests.push(request.url());
  });
  await page.goto("/");
  await expect(page.locator(".site-nav a[href='/case']")).toHaveCount(0);
  expect(requests).toHaveLength(0);
  await page.locator(".site-logo").click({ button: "right" });
  await page.locator(".brand-context-menu a[href='/case']").hover();
  await expect.poll(() => requests.length).toBe(1);
  const opening = page.waitForEvent("popup");
  await page.locator(".brand-context-menu a[href='/case']").click();
  const destination = await opening;
  await expect(destination.locator(".case-study")).toBeVisible();
  await destination.close();
});

test("slow case route shows a skeleton before content", async ({ page }) => {
  await seed(page);
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await page.route("**/assets/CasePage-*.js", async (route) => {
    await gate;
    await route.continue();
  });
  try {
    await page.goto("/case", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("status", { name: "Загрузка кейса" }),
    ).toBeVisible();
    await expect(page.locator(".case-loading .case-skeleton")).toHaveCount(5);
  } finally {
    release();
  }
  await expect(page.locator(".case-study")).toBeVisible();
  await expect(page.locator(".case-loading")).toHaveCount(0);
});

test("case illustrations prefetch near the viewport and replace their skeletons", async ({
  page,
}) => {
  await seed(page);
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await page.route("**/assets/CaseVisuals-*.js", async (route) => {
    await gate;
    await route.continue();
  });
  try {
    await page.goto("/case", { waitUntil: "domcontentloaded" });
    await expect(
      page.locator('.case-media[data-media="workflow"] .case-skeleton'),
    ).toBeVisible();
    await expect(
      page.locator('.case-media[data-media="brand"]'),
    ).toHaveAttribute("aria-busy", "true");
  } finally {
    release();
  }
  await expect(page.locator(".case-workflow-visual")).toBeVisible();
  await expect(
    page.locator('.case-media[data-media="workflow"]'),
  ).toHaveAttribute("aria-busy", "false");
  await expect(page.locator(".case-brand-visual")).toHaveCount(0);
  await page.locator("#brand").scrollIntoViewIfNeeded();
  await expect(page.locator(".case-brand-visual")).toBeVisible();
});

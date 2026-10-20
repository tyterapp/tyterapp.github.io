import { test, expect } from "@playwright/test";
import { telegramLink } from "../src/telegram.js";
import { telegramMetadata } from "../server/telegram-share.mjs";

async function setup(
  page,
  { suspended = false, width = 1440, theme = "light" } = {},
) {
  await page.setViewportSize({ width, height: width < 832 ? 844 : 1000 });
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  await page.addInitScript(
    ({ suspended, theme }) => {
      localStorage.setItem(
        "tyter.editor-preferences.v1",
        JSON.stringify({ theme }),
      );
      window.tones = { starts: 0, stops: 0, closed: 0 };
      window.AudioContext = class {
        state = suspended ? "suspended" : "running";
        currentTime = 0;
        destination = {};
        resume() {
          this.state = "running";
          return Promise.resolve();
        }
        close() {
          window.tones.closed++;
          return Promise.resolve();
        }
        createOscillator() {
          return {
            frequency: { value: 0 },
            connect(node) {
              return node;
            },
            disconnect() {},
            start() {
              window.tones.starts++;
            },
            stop() {
              window.tones.stops++;
            },
          };
        }
        createGain() {
          return {
            gain: {
              value: 0,
              cancelScheduledValues() {},
              setValueAtTime() {},
              linearRampToValueAtTime() {},
            },
            connect() {
              return this;
            },
            disconnect() {},
          };
        }
      };
    },
    { suspended, theme },
  );
  await page.clock.install();
}

test("server-rendered short telegram links read their embedded text and title without a URL fragment", async ({
  page,
}) => {
  await setup(page);
  const telegram = {
    version: 1,
    text: "HI",
    language: "en",
    title: "The hill story",
  };
  await page.route(
    (url) => url.pathname === "/telegram/" && url.searchParams.has("id"),
    async (route) => {
      const response = await route.fetch();
      const html = telegramMetadata(
        await response.text(),
        telegram,
        route.request().url(),
        "https://example.test/cover.png",
      );
      await route.fulfill({ response, body: html });
    },
  );
  await page.goto("/telegram/?id=1234567890abcdef1234567890abcdef");
  await expect(page).toHaveTitle("The hill story — Tyter");
  await page.clock.runFor(1500);
  await expect(
    page.locator(".telegram-transmission .telegraph-text"),
  ).toHaveText("HI");
  await expect(
    page.locator(".telegram-paper h1,.telegram-paper-heading"),
  ).toHaveCount(0);
});

test("shared page transmits from the beginning, replays and cancels old audio on a new telegram", async ({
  page,
}, info) => {
  await setup(page);
  const link = telegramLink(
    "HI МИР",
    "ru",
    "http://localhost:5173",
    "Сценарий на холме",
  );
  await page.goto(new URL(link).pathname + new URL(link).hash);
  await expect(page.locator(".telegram-paper")).toHaveAccessibleName(
    "Текст телеграммы",
  );
  await expect(
    page.locator(
      ".telegram-paper h1, .telegram-paper-heading, .telegram-page-header",
    ),
  ).toHaveCount(0);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    "Сценарий на холме",
  );
  await expect(page.locator(".telegram-oiia")).toHaveAttribute("href", "/pro");
  await expect(page.locator(".telegram-oiia")).toHaveAttribute(
    "data-playing",
    "true",
  );
  await page.clock.runFor(3000);
  await expect(
    page.locator(".telegram-transmission .telegraph-text"),
  ).toHaveText("HI МИР");
  await expect(page.getByRole("status")).toContainText("доставлена");
  const sounds = await page.evaluate(() => window.tones);
  expect(sounds.starts).toBe(13);
  expect(sounds.stops).toBe(13);
  await page.getByRole("button", { name: "Прослушать заново" }).click();
  await expect(
    page.locator(".telegram-transmission .telegraph-text"),
  ).toHaveText("");
  await page.clock.runFor(260);
  await expect(
    page.locator(".telegram-transmission .telegraph-text"),
  ).toHaveText("H");
  await page.screenshot({
    path: info.outputPath("telegram-document-light.png"),
  });
  const next = telegramLink("E", "en");
  await page.evaluate((hash) => {
    location.hash = hash;
  }, new URL(next).hash);
  await expect(page.locator(".telegram-paper")).toHaveAccessibleName(
    "Telegram text",
  );
  await page.clock.runFor(1000);
  await expect(
    page.locator(".telegram-transmission .telegraph-text"),
  ).toHaveText("E");
  expect((await page.evaluate(() => window.tones)).closed).toBe(1);
});

test("blocked autoplay still reveals text; mobile replay unlocks sound and links render as plain text", async ({
  page,
}, info) => {
  await setup(page, { suspended: true, width: 320, theme: "dark" });
  const url = new URL(telegramLink("E", "en"));
  await page.goto(url.pathname + url.hash);
  await page.clock.runFor(1000);
  await expect(
    page.locator(".telegram-transmission .telegraph-text"),
  ).toHaveText("E");
  expect((await page.evaluate(() => window.tones)).starts).toBe(0);
  await expect(page.getByRole("status")).toContainText("sound");
  await page.getByRole("button", { name: "Listen again" }).click();
  await page.clock.runFor(1000);
  expect((await page.evaluate(() => window.tones)).starts).toBe(1);
  await expect(page.getByRole("status")).toHaveText("Telegram delivered");
  await page.screenshot({
    path: info.outputPath("telegram-document-dark-mobile.png"),
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
  ).toBe(0);
  const injected = new URL(
    telegramLink('<img src=x onerror="window.hacked=true">', "en"),
  );
  await page.evaluate((hash) => {
    location.hash = hash;
  }, injected.hash);
  await expect(page.locator(".telegram-transmission")).toHaveAttribute(
    "aria-label",
    '<img src=x onerror="window.hacked=true">',
  );
  expect(await page.locator(".telegram-transmission img").count()).toBe(0);
  expect(await page.evaluate(() => window.hacked)).toBeUndefined();
  await page.evaluate(() => {
    location.hash = "telegram=broken";
  });
  await expect(
    page.getByRole("heading", { name: "Телеграмма не найдена" }),
  ).toBeVisible();
  expect(await page.locator(".telegram-replay").count()).toBe(0);
});

import { test, expect } from "@playwright/test";
import { createProject } from "../src/data.js";
import { TIMER_MINUTES, WRITING_TIMER_STORAGE } from "../src/writing-timer.js";
import { grantPro } from "./helpers/pro-access.js";

const epoch = new Date("2026-10-09T12:00:00Z");
async function open(page, theme = "light", seed = true) {
  await grantPro(page);
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  if (seed) {
    const doc = createProject("Таймер сценария");
    await page.addInitScript(
      ({ doc, theme }) => {
        localStorage.setItem("tyter.projects.v1", JSON.stringify([doc]));
        localStorage.setItem("tyter.active", doc.id);
        localStorage.setItem("tyter.language.v1", "ru");
        localStorage.setItem(
          "tyter.editor-preferences.v1",
          JSON.stringify({ theme }),
        );
      },
      { doc, theme },
    );
  }
  if (seed) await page.clock.install({ time: epoch });
  await page.goto("/beta");
  if (!seed) await page.clock.runFor(250);
  await expect(page.locator(".screenplay-editor")).toBeFocused();
  if (seed) await page.clock.pauseAt(new Date(epoch.getTime() + 10_000));
}
const timer = (page) => page.locator(".writing-timer");
const balance = (page) => timer(page).locator(".writing-timer-balance > span");
const stored = (page) =>
  page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    WRITING_TIMER_STORAGE,
  );
async function start(page, minutes) {
  await timer(page)
    .getByRole("button", { name: "Открыть таймер", exact: true })
    .click();
  await timer(page)
    .getByRole("button", { name: `${minutes} мин`, exact: true })
    .click();
  await expect(timer(page).getByRole("timer")).toHaveText(
    `${String(minutes).padStart(2, "0")}:00`,
  );
}

test("the timer pauses, survives reload, resumes and awards once; early stops earn nothing", async ({
  page,
}) => {
  await open(page);
  await expect(balance(page)).toHaveText("0");
  await start(page, 25);
  await page.clock.fastForward(90_000);
  await expect(timer(page).getByRole("timer")).toHaveText("23:30");
  await timer(page)
    .getByRole("button", { name: "Приостановить таймер", exact: true })
    .click();
  await expect(
    timer(page).getByRole("button", { name: "Продолжить таймер", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.clock.fastForward(15 * 60_000);
  await expect(timer(page).getByRole("timer")).toHaveText("23:30");
  await page.reload();
  await expect(timer(page).getByRole("timer")).toHaveText("23:30");
  await timer(page)
    .getByRole("button", { name: "Продолжить таймер", exact: true })
    .click();
  await page.clock.fastForward(23 * 60_000 + 29_000);
  await expect(timer(page).getByRole("timer")).toHaveText("00:01");
  await page.clock.fastForward(1000);
  await expect(balance(page)).toHaveText("25");
  await expect(page.locator(".app-message")).toContainText(
    "Начислено монет: 25.",
  );
  await page.reload();
  await expect(balance(page)).toHaveText("25");
  await expect(page.locator(".app-message")).toHaveCount(0);
  await start(page, 10);
  await page.clock.fastForward(5000);
  await timer(page)
    .getByRole("button", { name: "Завершить таймер", exact: true })
    .click();
  await expect(balance(page)).toHaveText("25");
  await page.clock.fastForward(10 * 60_000);
  await expect(balance(page)).toHaveText("25");
  await start(page, 5);
  await timer(page)
    .getByRole("button", { name: "Приостановить таймер", exact: true })
    .click();
  await timer(page)
    .getByRole("button", { name: "Завершить таймер", exact: true })
    .click();
  await expect(balance(page)).toHaveText("25");
  expect(await stored(page)).toEqual({ coins: 25, session: null });
});

test("every preset earns one coin per selected minute, including a timer completed while the app was closed", async ({
  page,
}) => {
  await open(page);
  let coins = 0;
  for (const minutes of TIMER_MINUTES) {
    await start(page, minutes);
    if (minutes === 5) {
      await page.goto("about:blank");
      await page.clock.fastForward(minutes * 60_000);
      await page.goto("/beta");
    } else {
      await page.clock.fastForward(minutes * 60_000);
    }
    coins += minutes;
    await expect(balance(page)).toHaveText(String(coins));
    expect(await stored(page)).toEqual({ coins, session: null });
  }
  await page.clock.fastForward(60_000);
  await expect(balance(page)).toHaveText("460");
});

test("two tabs share pause and countdown, and claim a completed session only once", async ({
  page,
  context,
}) => {
  test.setTimeout(60000);
  await open(page);
  const second = await context.newPage();
  await open(second, "light", false);
  await start(page, 5);
  await expect(timer(second).getByRole("timer")).toHaveText("05:00");
  await timer(second)
    .getByRole("button", { name: "Приостановить таймер", exact: true })
    .click();
  await expect(
    timer(page).getByRole("button", { name: "Продолжить таймер", exact: true }),
  ).toBeVisible();
  await page.bringToFront();
  await page.clock.runFor(50);
  await timer(page)
    .getByRole("button", { name: "Продолжить таймер", exact: true })
    .click();
  await expect(
    timer(second).getByRole("button", {
      name: "Приостановить таймер",
      exact: true,
    }),
  ).toBeVisible();
  // Playwright's clock is shared by the entire browser context, including both tabs.
  await page.clock.fastForward(300_000);
  await expect(balance(page)).toHaveText("5");
  await expect(balance(second)).toHaveText("5");
  expect(await stored(page)).toEqual({ coins: 5, session: null });
  await second.reload();
  await expect(balance(second)).toHaveText("5");
  await second.close();
});

test("the timer keeps running across documents, outline and focus mode", async ({
  page,
}) => {
  await open(page);
  await start(page, 5);
  await page.getByRole("button", { name: "Аутлайн", exact: true }).click();
  await expect(timer(page)).toHaveCount(0);
  await page.clock.fastForward(60_000);
  await page.getByRole("button", { name: "Сценарий", exact: true }).click();
  await expect(timer(page).getByRole("timer")).toHaveText("04:00");
  await page
    .getByRole("button", { name: "Открыть во весь экран", exact: true })
    .click();
  await expect(timer(page)).toHaveCount(0);
  await page.clock.fastForward(60_000);
  await page
    .getByRole("button", {
      name: "Выйти из полноэкранного режима",
      exact: true,
    })
    .click();
  await expect(timer(page).getByRole("timer")).toHaveText("03:00");
  await page.getByRole("button", { name: "Документы", exact: true }).click();
  await page
    .getByRole("button", { name: "Новый сценарий", exact: true })
    .click();
  await expect(timer(page).getByRole("timer")).toHaveText("03:00");
  await page.clock.fastForward(180_000);
  await expect(balance(page)).toHaveText("5");
  await page.clock.runFor(1200);
  const documents = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("tyter.projects.v1")),
  );
  expect(documents).toHaveLength(2);
  expect(
    documents.some((doc) => "coins" in doc || "session" in doc.metadata),
  ).toBe(false);
});

for (const theme of ["light", "dark"]) {
  test(`${theme}: timer controls fit beside the toolbar, adapt to a narrow window and translate`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 2048, height: 1100 });
    await open(page, theme);
    await expect(timer(page)).not.toHaveClass(/is-stacked/);
    await timer(page)
      .getByRole("button", { name: "Открыть таймер", exact: true })
      .click();
    await expect(
      timer(page).getByRole("group", { name: "Время таймера", exact: true }),
    ).toBeVisible();
    await expect(timer(page).getByRole("button")).toHaveCount(7);
    await page.screenshot({ path: info.outputPath("duration-picker.png") });
    await page.keyboard.press("Escape");
    await expect(balance(page)).toHaveText("0");
    await start(page, 25);
    await timer(page)
      .getByRole("button", { name: "Приостановить таймер", exact: true })
      .hover();
    const colors = await timer(page)
      .getByRole("button", { name: "Приостановить таймер", exact: true })
      .evaluate((button) => ({
        color: getComputedStyle(button).color,
        background: getComputedStyle(button).backgroundColor,
      }));
    expect(colors.color).not.toBe(colors.background);
    await page.screenshot({ path: info.outputPath("running.png") });
    await page.setViewportSize({ width: 700, height: 780 });
    await expect(timer(page)).toHaveClass(/is-stacked/);
    const boxes = await page.evaluate(() => {
      const box = (selector) => {
        const rect = document.querySelector(selector).getBoundingClientRect();
        return {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
        };
      };
      return {
        timer: box(".writing-timer"),
        bar: box(".screenplay-format-bar"),
        viewport: innerWidth,
      };
    });
    expect(boxes.timer.bottom).toBeLessThanOrEqual(boxes.bar.top);
    expect(boxes.timer.left).toBeGreaterThanOrEqual(0);
    expect(boxes.timer.right).toBeLessThanOrEqual(boxes.viewport);
    await page.getByRole("button", { name: "ENG", exact: true }).click();
    await expect(
      timer(page).getByRole("button", { name: "Pause timer", exact: true }),
    ).toBeVisible();
    await timer(page)
      .getByRole("button", { name: "Pause timer", exact: true })
      .click();
    await expect(
      timer(page).getByRole("button", { name: "Resume timer", exact: true }),
    ).toBeVisible();
    await timer(page)
      .getByRole("button", { name: "End timer", exact: true })
      .click();
    await expect(timer(page).locator(".writing-timer-balance")).toHaveAttribute(
      "aria-label",
      "Coins: 0",
    );
    await timer(page)
      .getByRole("button", { name: "Open timer", exact: true })
      .click();
    await expect(
      timer(page).getByRole("button", { name: "240 min", exact: true }),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 780 });
    await expect(timer(page)).toHaveClass(/is-stacked/);
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const timer = document
            .querySelector(".writing-timer")
            .getBoundingClientRect();
          const bar = document
            .querySelector(".screenplay-format-bar")
            .getBoundingClientRect();
          return timer.bottom <= bar.top && timer.right <= innerWidth;
        }),
      )
      .toBe(true);
    await page.screenshot({ path: info.outputPath("narrow.png") });
  });
}

test("an unavailable local storage does not interrupt the timer or editing", async ({
  page,
}) => {
  await open(page);
  await page.evaluate((key) => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key)
        throw new DOMException("Storage full", "QuotaExceededError");
      return setItem.call(this, name, value);
    };
  }, WRITING_TIMER_STORAGE);
  await start(page, 5);
  await page.clock.fastForward(300_000);
  await expect(balance(page)).toHaveText("5");
  await page.locator(".screenplay-editor").click();
  await page.keyboard.type("Сценарий продолжается.");
  await expect(page.locator(".screenplay-editor")).toContainText(
    "Сценарий продолжается.",
  );
  await start(page, 10);
  await page.clock.fastForward(600_000);
  await expect(balance(page)).toHaveText("15");
});

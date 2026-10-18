import { test, expect } from "@playwright/test";
import { createProject } from "../src/data.js";
import { grantPro } from "./helpers/pro-access.js";

const key = "tyter.writing-timer.v1";
const coins = (page) => page.locator(".writing-timer-balance");
const panel = (page) => page.locator("#writing-coins");
const readWallet = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key);

async function open(
  page,
  { theme = "light", earned = false, empty = false } = {},
) {
  await grantPro(page);
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  const doc = createProject("История с монетами");
  await page.addInitScript(
    ({ doc, theme, earned, empty, key }) => {
      if (sessionStorage.getItem("coins-seeded")) return;
      sessionStorage.setItem("coins-seeded", "yes");
      const now = Date.now(),
        date = new Date(now);
      const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      localStorage.setItem("tyter.projects.v1", JSON.stringify([doc]));
      localStorage.setItem("tyter.active", doc.id);
      localStorage.setItem("tyter.language.v1", "ru");
      localStorage.setItem(
        "tyter.editor-preferences.v1",
        JSON.stringify({ theme }),
      );
      localStorage.setItem(
        key,
        JSON.stringify(
          empty
            ? {
                coins: 0,
                session: null,
                progressResetDay: day,
              }
            : {
                coins: 38,
                session: null,
                streak: { day, count: earned ? 5 : 3, best: 9 },
                writing: { characters: 142, receipts: ["past-writing"] },
                purchases: { "oiia-house": { cost: 100, purchasedAt: now } },
                ...(earned
                  ? { achievements: { scavenger: { date: day } } }
                  : {}),
              },
        ),
      );
    },
    { doc, theme, earned, empty, key },
  );
  await page.goto("/beta");
  await expect(page.locator(".screenplay-editor")).toBeVisible();
  await expect(coins(page)).toBeVisible();
}

test("coin onboarding shows real rewards and progress; section navigation, keyboard and shared popovers never spend coins", async ({
  page,
}, info) => {
  await open(page);
  await expect(page.locator(".writing-timer .lucide-flame")).toHaveCount(0);
  await expect(page.locator(".writing-streak")).toHaveCount(0);
  const before = await readWallet(page);
  await coins(page).click();
  await expect(panel(page)).toBeVisible();
  await panel(page).screenshot({
    path: info.outputPath("coins-shop-entry.png"),
  });
  await expect(coins(page)).toHaveAttribute("aria-expanded", "true");
  await expect(panel(page)).toContainText(
    "5 минут = 5 монет, 25 минут = 25 монет",
  );
  await expect(panel(page)).toContainText("Досрочное завершение — без награды");
  await expect(panel(page)).toContainText(
    "Каждые 100 новых символов истории приносят 10 монет",
  );
  await expect(panel(page)).toContainText("До следующих 10 монет: 58 символов");
  await expect(
    panel(page).getByRole("button", { name: "Закрыть монеты" }),
  ).toBeFocused();
  await panel(page)
    .getByRole("button", { name: "Стрики за день", exact: true })
    .click();
  await expect(panel(page).locator("dd")).toHaveText(["3", "9"]);
  await expect(panel(page).locator("li.is-complete")).toHaveCount(3);
  await expect(panel(page)).toContainText("За вход каждый день — 1 монета");
  await expect(panel(page)).toContainText(
    "За каждые 5 дней подряд — ещё 10 монет",
  );
  await expect(panel(page)).toContainText("Сегодняшний вход учтён");
  await panel(page).getByRole("button", { name: "Назад к монетам" }).click();
  await expect(
    panel(page).getByRole("button", { name: "Стрики за день", exact: true }),
  ).toBeFocused();
  await panel(page)
    .getByRole("button", { name: "Достижения", exact: true })
    .click();
  await expect(panel(page)).toContainText("Мусорщик");
  await expect(panel(page)).toContainText("Удалите любую версию страницы.");
  await expect(panel(page)).toContainText("Ещё не получено");
  await expect(panel(page)).toContainText("+10");
  await page.keyboard.press("Escape");
  await expect(panel(page)).toHaveCount(0);
  await expect(coins(page)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(panel(page)).toBeVisible();
  await coins(page).click();
  await expect(panel(page)).toHaveCount(0);
  await coins(page).click();
  await page.locator(".screenplay-editor").click();
  await expect(panel(page)).toHaveCount(0);
  await coins(page).click();
  await page
    .getByRole("button", { name: "Открыть oiia домик", exact: true })
    .click();
  await expect(panel(page)).toHaveCount(0);
  await expect(page.locator("#writing-house")).toBeVisible();
  await coins(page).click();
  await expect(page.locator("#writing-house")).toHaveCount(0);
  await expect(panel(page)).toBeVisible();
  await expect(
    page.locator(".writing-timer > button .lucide-store"),
  ).toHaveCount(0);
  await expect(panel(page).locator(".writing-coins-section")).toHaveText([
    /Стрики за день/,
    /Достижения/,
    "Магазин",
  ]);
  await panel(page).evaluate((element) => {
    window.coinsWindow = element;
  });
  await page
    .getByRole("button", { name: "Открыть магазин", exact: true })
    .click();
  await expect(panel(page)).toBeVisible();
  await expect(panel(page)).toHaveAccessibleName("Магазин");
  expect(
    await panel(page).evaluate((element) => element === window.coinsWindow),
  ).toBe(true);
  await expect(page.locator(".writing-timer [role='dialog']")).toHaveCount(1);
  await expect(page.locator("#writing-shop")).toBeVisible();
  await panel(page)
    .getByRole("button", { name: "Разное", exact: true })
    .click();
  await panel(page)
    .getByRole("button", { name: "Назад к категориям", exact: true })
    .click();
  await panel(page)
    .getByRole("button", { name: "Назад к монетам", exact: true })
    .click();
  await expect(panel(page)).toHaveAccessibleName("Монеты");
  await expect(
    panel(page).getByRole("button", { name: "Открыть магазин", exact: true }),
  ).toBeFocused();
  await expect(page.locator("#writing-shop")).toHaveCount(0);
  expect(await readWallet(page)).toEqual(before);
  await panel(page)
    .getByRole("button", { name: "Закрыть монеты", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Открыть таймер", exact: true })
    .click();
  await page.getByRole("button", { name: "5 мин", exact: true }).click();
  await expect(coins(page)).toBeVisible();
  await expect(coins(page)).toBeEnabled();
  await coins(page).click();
  await panel(page)
    .getByRole("button", { name: "Открыть магазин", exact: true })
    .click();
  await expect(page.getByRole("timer")).toBeVisible();
  await expect(panel(page)).toHaveAccessibleName("Магазин");
  expect((await readWallet(page)).coins).toBe(before.coins);
});

test("earned achievements and five-day streak are shown, and an external progress reset updates the open panel", async ({
  page,
}) => {
  await open(page, { earned: true });
  const before = await readWallet(page);
  await coins(page).click();
  await panel(page)
    .getByRole("button", { name: "Стрики за день", exact: true })
    .click();
  await expect(panel(page).locator("li.is-complete")).toHaveCount(5);
  await panel(page).getByRole("button", { name: "Назад к монетам" }).click();
  await expect(panel(page)).toContainText("Получено: 1 из 2");
  await panel(page)
    .getByRole("button", { name: "Достижения", exact: true })
    .click();
  await expect(panel(page).locator('[data-earned="true"]')).toBeVisible();
  await expect(panel(page).locator("time")).toHaveAttribute(
    "datetime",
    before.achievements.scavenger.date,
  );
  const reset = {
    coins: 0,
    session: null,
    progressResetDay: before.streak.day,
  };
  await page.evaluate(
    ({ key, reset }) => {
      const oldValue = localStorage.getItem(key),
        newValue = JSON.stringify(reset);
      localStorage.setItem(key, newValue);
      window.dispatchEvent(
        new StorageEvent("storage", { key, oldValue, newValue }),
      );
    },
    { key, reset },
  );
  await expect(panel(page).locator('[data-earned="false"]')).toHaveCount(2);
  await expect(panel(page)).toContainText("Ещё не получено");
  await expect(coins(page)).toHaveAccessibleName("Монеты: 0");
  await panel(page).getByRole("button", { name: "Назад к монетам" }).click();
  await expect(panel(page)).toContainText(
    "До следующих 10 монет: 100 символов",
  );
  await expect(panel(page)).toContainText("Пока нет достижений");
  await panel(page)
    .getByRole("button", { name: "Стрики за день", exact: true })
    .click();
  await expect(panel(page).locator("dd")).toHaveText(["0", "0"]);
  await expect(panel(page).locator("li.is-complete")).toHaveCount(0);
  expect((await readWallet(page)).coins).toBe(0);
});

test("320px dark mode: the empty wallet, English sections and reduced motion fit the viewport with touch targets", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page, { theme: "dark", empty: true });
  await page.getByRole("button", { name: "ENG", exact: true }).click();
  await coins(page).click();
  await expect(panel(page)).toHaveAccessibleName("Coins");
  await panel(page).screenshot({
    path: info.outputPath("coins-shop-entry-mobile-dark.png"),
  });
  await expect(panel(page)).toContainText("Every 100 new characters");
  await expect(panel(page)).toContainText("Ending early gives no reward");
  const bounds = await panel(page).boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
  expect((await coins(page).boundingBox()).height).toBe(44);
  for (const name of [
    "Daily streaks",
    "Achievements",
    "Open shop",
    "Close coins",
  ]) {
    const hit = await panel(page)
      .getByRole("button", { name, exact: true })
      .boundingBox();
    expect(hit.height).toBeGreaterThanOrEqual(44);
  }
  expect(
    await panel(page).evaluate(
      (element) => getComputedStyle(element).animationName,
    ),
  ).toBe("none");
  await panel(page)
    .getByRole("button", { name: "Daily streaks", exact: true })
    .click();
  await expect(panel(page).locator("dd")).toHaveText(["0", "0"]);
  await expect(panel(page)).toContainText("Earn 1 coin for each daily visit");
  await panel(page).getByRole("button", { name: "Back to coins" }).click();
  await panel(page)
    .getByRole("button", { name: "Achievements", exact: true })
    .click();
  await expect(panel(page)).toContainText("Scavenger");
  await expect(panel(page)).toContainText("Delete any page version.");
  await expect(panel(page)).toContainText("Not unlocked yet");
  await panel(page).getByRole("button", { name: "Back to coins" }).click();
  await panel(page)
    .getByRole("button", { name: "Open shop", exact: true })
    .click();
  await expect(panel(page)).toHaveAccessibleName("Shop");
  await expect(
    panel(page).getByRole("button", { name: "Miscellaneous", exact: true }),
  ).toBeVisible();
  await panel(page)
    .getByRole("button", { name: "Back to coins", exact: true })
    .click();
  await panel(page)
    .getByRole("button", { name: "Close coins", exact: true })
    .click();
  await expect(panel(page)).toHaveCount(0);
  await expect(coins(page)).toBeFocused();
  expect((await readWallet(page)).coins).toBe(0);
});

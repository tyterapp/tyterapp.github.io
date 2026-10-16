import { openWritingShop } from "./helpers/writing-shop.js";
import { test, expect } from "@playwright/test";
import { createProject } from "../src/data.js";
import { localDay, dailyVisit } from "../src/daily-streak.js";
import {
  cleanWalletExtras,
  resetWalletProgress,
  recordWalletWriting,
} from "../src/writing-wallet.js";
import { grantPro } from "./helpers/pro-access.js";

const key = "tyter.writing-timer.v1";
const wallet = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key);
const shop = (page) =>
  page.getByRole("dialog", { name: "Магазин", exact: true });
const resetButton = (page) =>
  shop(page).getByRole("button", { name: /Сбросить прогресс/ });
const confirm = (page) =>
  page
    .locator(".app-message")
    .getByRole("button", { name: "Сбросить за 200 монет", exact: true });

test("reset requires 200 coins, clears game progress, and keeps replay receipts and deletion history", () => {
  const time = new Date("2026-10-14T12:00:00Z").getTime();
  const old = {
    coins: 500,
    session: { id: "active" },
    purchases: {
      "oiia-house": { purchasedAt: time, cost: 100 },
      "script-doctor": { purchasedAt: time, cost: 20 },
    },
    writing: { characters: 199, receipts: ["old-writing"] },
    streak: { day: localDay(time), count: 10, best: 10 },
    achievements: { scavenger: { date: localDay(time) } },
    ideas: [{ id: "old-idea" }],
    deletions: [{ id: "old-deletion" }],
  };
  const poor = { ...old, coins: 199 };
  expect(resetWalletProgress(poor, time)).toMatchObject({
    ok: false,
    reason: "coins",
  });
  expect(resetWalletProgress(poor, time).wallet).toBe(poor);
  const result = resetWalletProgress(old, time);
  expect(result.wallet).toEqual({
    coins: 0,
    session: null,
    progressResetDay: localDay(time),
    writing: { characters: 0, receipts: ["old-writing"] },
    deletions: old.deletions,
  });
  expect(cleanWalletExtras(result.wallet).progressResetDay).toBe(
    localDay(time),
  );
  expect(dailyVisit(result.wallet, time).reward).toBe(0);
  expect(dailyVisit(result.wallet, time).wallet).toBe(result.wallet);
  expect(dailyVisit(result.wallet, time + 86400000)).toMatchObject({
    reward: 1,
    wallet: { coins: 1, streak: { count: 1, best: 1 } },
  });
  expect(
    recordWalletWriting(result.wallet, {
      id: "old-writing",
      scope: "doc",
      characters: 99,
    }).reward,
  ).toBe(0);
  const fresh = recordWalletWriting(result.wallet, {
    id: "new-writing",
    scope: "doc",
    characters: 99,
  });
  expect(fresh.reward).toBe(0);
  expect(
    recordWalletWriting(fresh.wallet, {
      id: "next-writing",
      scope: "doc",
      characters: 1,
    }).reward,
  ).toBe(10);
});

async function open(page, { seed = true, coins = 240, mobile = false } = {}) {
  await grantPro(page);
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  if (mobile) await page.setViewportSize({ width: 320, height: 720 });
  if (seed) {
    const doc = createProject("Сценарий после сброса");
    doc.content.content = [
      {
        type: "paragraph",
        attrs: { format: "scene", blockId: "reset-scene" },
        content: [{ type: "text", text: "ИНТ. ДОМ — ДЕНЬ" }],
      },
      {
        type: "paragraph",
        attrs: { format: "action", blockId: "reset-action" },
        content: [{ type: "text", text: "Кошка спит на диване." }],
      },
    ];
    await page.addInitScript(
      ({ doc, coins }) => {
        if (sessionStorage.getItem("reset-seeded")) return;
        const now = Date.now(),
          date = new Date(now);
        const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
        localStorage.setItem("tyter.projects.v1", JSON.stringify([doc]));
        localStorage.setItem("tyter.active", doc.id);
        localStorage.setItem("tyter.language.v1", "ru");
        localStorage.setItem(
          "tyter.writing-timer.v1",
          JSON.stringify({
            coins,
            session: null,
            purchases: {
              "oiia-house": { purchasedAt: now, cost: 100 },
              "script-doctor": { purchasedAt: now, cost: 20 },
            },
            writing: { characters: 199, receipts: ["past-typing"] },
            streak: { day, count: 5, best: 9 },
            achievements: { scavenger: { date: day } },
          }),
        );
        sessionStorage.setItem("reset-seeded", "yes");
      },
      { doc, coins },
    );
  }
  await page.goto("/beta");
  await expect(page.locator(".screenplay-editor")).toBeVisible();
}

async function requestReset(page) {
  await openWritingShop(page);
  await resetButton(page).click();
  await expect(confirm(page)).toBeVisible();
}

test("reset confirms at the top, persists zero after reload, leaves script text intact and allows fresh writing rewards and repurchases", async ({
  page,
}) => {
  await open(page);
  await requestReset(page);
  await expect(page.locator(".progress-reset-message")).toContainText(
    "Сценарии сохранятся",
  );
  expect((await wallet(page)).coins).toBe(240);
  await confirm(page).click();
  await expect(page.locator(".app-message")).toContainText("Прогресс сброшен");
  await expect(page.locator(".writing-timer-balance-content")).toHaveText("0");
  await expect(
    page.getByRole("button", { name: "Открыть oiia домик", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Доктор сценария", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Показать стрик", exact: true }),
  ).toHaveCount(0);
  const reset = await wallet(page);
  expect(reset.coins).toBe(0);
  expect(reset.purchases).toBeUndefined();
  expect(reset.achievements).toBeUndefined();
  expect(reset.writing.characters).toBe(0);
  await page.reload();
  await expect(page.locator(".screenplay-editor")).toContainText(
    "Кошка спит на диване.",
  );
  await expect(page.locator(".writing-timer-balance-content")).toHaveText("0");
  await openWritingShop(page);
  await expect(
    shop(page).getByRole("button", {
      name: "Купить oiia домик за 100 монет",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(shop(page).locator(".writing-shop-category")).toHaveCount(1);
  await shop(page).getByRole("button", { name: "Разное", exact: true }).click();
  await expect(
    shop(page).getByRole("button", {
      name: "Купить доктора сценария за 20 монет",
      exact: true,
    }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(shop(page)).toHaveCount(0);
  await page.locator(".screenplay-editor p").last().click();
  await page.keyboard.press("End");
  await page.keyboard.insertText("а".repeat(200));
  await expect(page.locator(".writing-timer-balance-content")).toHaveText("20");
  await openWritingShop(page);
  await shop(page).getByRole("button", { name: "Разное", exact: true }).click();
  await shop(page)
    .getByRole("button", {
      name: "Купить доктора сценария за 20 монет",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", { name: "Доктор сценария", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".writing-timer-balance-content")).toHaveText("0");
});

test("closing or letting the warning expire does not reset or spend anything", async ({
  page,
}) => {
  await open(page);
  await requestReset(page);
  await page
    .locator(".app-message")
    .getByRole("button", { name: "Закрыть уведомление", exact: true })
    .click();
  await expect(page.locator(".app-message")).toHaveCount(0);
  await expect(shop(page)).toHaveCount(0);
  expect((await wallet(page)).coins).toBe(240);
  const now = await page.evaluate(() => Date.now());
  await page.clock.install({ time: new Date(now + 1000) });
  await page.clock.pauseAt(new Date(now + 2000));
  await requestReset(page);
  await page.clock.runFor(5000);
  await expect(page.locator(".app-message")).toHaveClass(/is-closing/);
  await page.clock.runFor(300);
  await expect(page.locator(".app-message")).toHaveCount(0);
  expect((await wallet(page)).coins).toBe(240);
  expect(Object.keys((await wallet(page)).purchases)).toHaveLength(2);
});

test("199 coins cannot buy a reset, and the cost is rechecked when confirming", async ({
  page,
}) => {
  await open(page, { coins: 199 });
  await openWritingShop(page);
  await expect(resetButton(page)).toBeDisabled();
  await page.evaluate((key) => {
    const value = JSON.parse(localStorage.getItem(key));
    localStorage.setItem(key, JSON.stringify({ ...value, coins: 200 }));
    window.dispatchEvent(new StorageEvent("storage", { key }));
  }, key);
  await expect(resetButton(page)).toBeEnabled();
  await resetButton(page).click();
  await page.evaluate((key) => {
    const value = JSON.parse(localStorage.getItem(key));
    localStorage.setItem(key, JSON.stringify({ ...value, coins: 199 }));
  }, key);
  await confirm(page).click();
  await expect(page.locator(".app-message")).toContainText("нужно 200 монет");
  expect((await wallet(page)).coins).toBe(199);
  expect(Object.keys((await wallet(page)).purchases)).toHaveLength(2);
});

test("storage failure leaves balance and purchases unchanged", async ({
  page,
}) => {
  await open(page);
  await page.evaluate(() => {
    const save = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "tyter.writing-timer.v1")
        throw new DOMException("Full", "QuotaExceededError");
      return save.call(this, key, value);
    };
  });
  await requestReset(page);
  await confirm(page).click();
  await expect(page.locator(".app-message")).toContainText(
    "Не удалось сохранить сброс",
  );
  expect((await wallet(page)).coins).toBe(240);
  expect(Object.keys((await wallet(page)).purchases)).toHaveLength(2);
  await expect(
    page.getByRole("button", { name: "Открыть oiia домик", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Доктор сценария", exact: true }),
  ).toBeVisible();
});

test("simultaneous confirmations in two tabs reset once and remove entitlements from both", async ({
  page,
  context,
}) => {
  await open(page);
  const second = await context.newPage();
  await open(second, { seed: false });
  const viewer = await context.newPage();
  await open(viewer, { seed: false });
  await viewer
    .getByRole("button", { name: "Открыть oiia домик", exact: true })
    .click();
  await expect(
    viewer.getByRole("dialog", { name: "oiia домик", exact: true }),
  ).toBeVisible();
  await requestReset(page);
  await requestReset(second);
  const firstButton = await confirm(page).elementHandle();
  const secondButton = await confirm(second).elementHandle();
  await Promise.all([
    firstButton.evaluate((node) => node.click()),
    secondButton.evaluate((node) => node.click()),
  ]);
  for (const target of [page, second, viewer]) {
    await expect(target.locator(".writing-timer-balance-content")).toHaveText(
      "0",
    );
    await expect(
      target.getByRole("button", { name: "Открыть oiia домик", exact: true }),
    ).toHaveCount(0);
    await expect(
      target.getByRole("button", { name: "Доктор сценария", exact: true }),
    ).toHaveCount(0);
    await expect(
      target.getByRole("dialog", { name: "oiia домик", exact: true }),
    ).toHaveCount(0);
    await target.reload();
    await expect(target.locator(".writing-timer-balance-content")).toHaveText(
      "0",
    );
  }
  await second.close();
  await viewer.close();
});

test("320px: reset warning and confirmation stay readable inside the viewport and translate", async ({
  page,
}) => {
  await open(page, { mobile: true, coins: 200 });
  await requestReset(page);
  const message = page.locator(".progress-reset-message");
  const bounds = await message.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(720);
  expect((await confirm(page).boundingBox()).height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: ".cache/reset-warning-mobile.png" });
  await page.getByRole("button", { name: "ENG", exact: true }).click();
  await expect(page.locator(".app-message")).toContainText(
    "Resetting for 200 coins",
  );
  await page
    .locator(".app-message")
    .getByRole("button", { name: "Reset for 200 coins", exact: true })
    .click();
  await expect(page.locator(".app-message")).toContainText("Progress reset");
  await expect(page.locator(".writing-timer-balance-content")).toHaveText("0");
});

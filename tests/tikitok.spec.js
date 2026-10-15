import { test, expect } from "@playwright/test";
import { createProject } from "../src/data.js";
import {
  cleanWalletExtras,
  purchaseWalletTikiTok,
  walletHasTikiTok,
  resetWalletProgress,
} from "../src/writing-wallet.js";
import { grantPro } from "./helpers/pro-access.js";
import { openWritingShop } from "./helpers/writing-shop.js";

const key = "tyter.writing-timer.v1";
const panel = (page) => page.locator("#writing-tikitok");
const video = (page) => panel(page).locator("video");
const tile = (page) => page.locator('[data-product="tikitok"]');
const opener = (page) =>
  tile(page).getByRole("button", { name: /^(Открыть TikiTok|Open TikiTok)$/ });
const footerOpener = (page) =>
  page.locator('.writing-timer > button[aria-controls="writing-tikitok"]');
const wallet = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key);

async function open(
  page,
  {
    coins = 200,
    owned = false,
    width = 1440,
    height = 1000,
    theme = "light",
    pro = true,
    seed = true,
  } = {},
) {
  await page.setViewportSize({ width, height });
  if (pro) await grantPro(page);
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  await page.addInitScript(
    ({ doc, key, coins, owned, theme, seed }) => {
      if (!seed || sessionStorage.getItem("tikitok-seeded")) return;
      sessionStorage.setItem("tikitok-seeded", "1");
      localStorage.setItem("tyter.onboarding.v1", "done");
      localStorage.setItem("tyter.projects.v1", JSON.stringify([doc]));
      localStorage.setItem("tyter.active", doc.id);
      localStorage.setItem("tyter.language.v1", "ru");
      localStorage.setItem(
        "tyter.editor-preferences.v1",
        JSON.stringify({ theme }),
      );
      const date = new Date(),
        day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      localStorage.setItem(
        key,
        JSON.stringify({
          coins,
          session: null,
          streak: { day, count: 1, best: 1 },
          ...(owned
            ? { purchases: { tikitok: { cost: 200, purchasedAt: Date.now() } } }
            : {}),
        }),
      );
    },
    { doc: createProject("Просмотр TikiTok"), key, coins, owned, theme, seed },
  );
  await page.goto(pro ? "/beta" : "/free");
  await expect(page.locator(".screenplay-editor")).toBeVisible();
}
async function misc(page) {
  await openWritingShop(page);
  const category = page.getByRole("button", {
    name: /^(Разное|Miscellaneous)$/,
  });
  if (await category.count()) await category.click();
}
async function startPlayer(page) {
  await misc(page);
  await expect(footerOpener(page)).toHaveCount(0);
  await opener(page).click();
}
async function playing(page) {
  await expect(panel(page)).toBeVisible();
  await expect
    .poll(() =>
      video(page).evaluate(
        (node) =>
          node.readyState >= 2 && !node.paused && node.videoWidth === 720,
      ),
    )
    .toBe(true);
}
async function holdVideo(page) {
  await video(page).evaluate((node) => {
    window.closedTikiTok = node;
  });
}
async function released(page) {
  await expect(panel(page)).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        closedTikiTok.paused &&
        !closedTikiTok.hasAttribute("src") &&
        closedTikiTok.readyState === 0,
    ),
  ).toBe(true);
}

test("TikiTok costs 200 once, survives cleaning, and is removed by the existing progress reset", () => {
  const initial = { coins: 200, session: null };
  expect(purchaseWalletTikiTok({ ...initial, coins: 199 })).toMatchObject({
    ok: false,
    reason: "coins",
  });
  const purchase = purchaseWalletTikiTok(initial, 123);
  expect(purchase.ok).toBe(true);
  expect(purchase.wallet.coins).toBe(0);
  expect(walletHasTikiTok(purchase.wallet)).toBe(true);
  expect(cleanWalletExtras(purchase.wallet).purchases.tikitok).toEqual({
    cost: 200,
    purchasedAt: 123,
  });
  expect(purchaseWalletTikiTok(purchase.wallet, 456)).toMatchObject({
    wallet: purchase.wallet,
    ok: true,
    alreadyOwned: true,
  });
  expect(
    walletHasTikiTok(
      resetWalletProgress({ ...purchase.wallet, coins: 200 }).wallet,
    ),
  ).toBe(false);
  expect(initial.coins).toBe(200);
});

test("buying only unlocks TikiTok; the supplied video loops in the mini player, writing continues, and close releases playback", async ({
  page,
}, info) => {
  await open(page);
  await expect(opener(page)).toHaveCount(0);
  await misc(page);
  await expect(tile(page)).toHaveText("TikiTok200");
  await tile(page)
    .getByRole("button", { name: "Купить TikiTok за 200 монет", exact: true })
    .click();
  await expect(
    tile(page).getByRole("button", { name: "Открыть TikiTok", exact: true }),
  ).toBeVisible();
  expect((await wallet(page)).coins).toBe(0);
  await expect(footerOpener(page)).toHaveCount(0);
  await expect(opener(page).locator(".lucide-play")).toHaveCount(1);
  await expect(opener(page).locator(".lucide-clapperboard")).toHaveCount(0);
  await expect(page.locator("video")).toHaveCount(0);
  await tile(page)
    .getByRole("button", { name: "Открыть TikiTok", exact: true })
    .click();
  await playing(page);
  await expect(panel(page)).toHaveText("TikiTok");
  expect(
    await video(page).evaluate((node) => ({
      loop: node.loop,
      inline: node.playsInline,
      muted: node.muted,
      controls: node.controls,
    })),
  ).toEqual({ loop: true, inline: true, muted: true, controls: false });
  await video(page).evaluate((node) => {
    node.currentTime = node.duration - 0.15;
  });
  await expect
    .poll(() =>
      video(page).evaluate(
        (node) =>
          !node.paused && node.currentTime > 0.02 && node.currentTime < 2,
      ),
    )
    .toBe(true);
  await page.locator(".screenplay-editor p").last().click();
  await page.keyboard.insertText("Можно писать во время просмотра.");
  await expect(panel(page)).toBeVisible();
  await expect(page.locator(".screenplay-editor")).toContainText(
    "Можно писать во время просмотра.",
  );
  await panel(page)
    .getByRole("button", { name: "Приостановить TikiTok", exact: true })
    .click();
  expect(await video(page).evaluate((node) => node.paused)).toBe(true);
  await panel(page)
    .getByRole("button", { name: "Воспроизвести TikiTok", exact: true })
    .click();
  await playing(page);
  await panel(page)
    .getByRole("button", { name: "Включить звук TikiTok", exact: true })
    .click();
  expect(await video(page).evaluate((node) => node.muted)).toBe(false);
  await panel(page).screenshot({ path: info.outputPath("tikitok-player.png") });
  await holdVideo(page);
  await panel(page)
    .getByRole("button", { name: "Закрыть TikiTok", exact: true })
    .click();
  await released(page);
  await expect(page.locator(".writing-timer-balance")).toBeFocused();
  for (let i = 0; i < 2; i++) {
    await startPlayer(page);
    await playing(page);
    await holdVideo(page);
    await page.keyboard.press("Escape");
    await released(page);
  }
  await page.reload();
  await expect(footerOpener(page)).toHaveCount(0);
  await misc(page);
  await expect(opener(page)).toBeVisible();
  await expect(page.locator("video")).toHaveCount(0);
  expect((await wallet(page)).coins).toBe(0);
  await opener(page).click();
  await playing(page);
});

test("an unaffordable or unsaved TikiTok purchase never spends coins or unlocks playback", async ({
  page,
}) => {
  await open(page, { coins: 199 });
  await misc(page);
  const buy = tile(page).getByRole("button", {
    name: "Купить TikiTok за 200 монет",
    exact: true,
  });
  await expect(buy).toBeDisabled();
  await page.evaluate((key) => {
    const value = JSON.parse(localStorage.getItem(key));
    localStorage.setItem(key, JSON.stringify({ ...value, coins: 200 }));
    window.dispatchEvent(new StorageEvent("storage", { key }));
  }, key);
  await expect(buy).toBeEnabled();
  await page.evaluate((key) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new DOMException("full", "QuotaExceededError");
      return original.call(this, name, value);
    };
  }, key);
  await buy.click();
  await expect(page.locator(".writing-shop-error")).toContainText(
    "Не удалось сохранить покупку",
  );
  expect((await wallet(page)).coins).toBe(200);
  await expect(opener(page)).toHaveCount(0);
  await expect(page.locator("video")).toHaveCount(0);
});

for (const [width, height, theme] of [
  [320, 560, "dark"],
  [390, 844, "light"],
])
  test(`${width}px ${theme}: Free includes the owned player, touch controls fit, and another panel pauses video`, async ({
    page,
  }, info) => {
    await open(page, { width, height, theme, pro: false, owned: true });
    await page.getByRole("button", { name: "ENG", exact: true }).click();
    await startPlayer(page);
    await playing(page);
    const box = await panel(page).boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(box.y + box.height).toBeLessThanOrEqual(height);
    const buttons = await panel(page).locator("button").all();
    for (const button of buttons) {
      const hit = await button.boundingBox();
      expect(hit.width).toBeGreaterThanOrEqual(44);
      expect(hit.height).toBeGreaterThanOrEqual(44);
    }
    await panel(page).screenshot({
      path: info.outputPath("tikitok-mobile.png"),
    });
    await holdVideo(page);
    await page.locator(".writing-timer-balance").click();
    await released(page);
    await expect(page.locator("#writing-coins")).toBeVisible();
  });

test("two tabs unlock TikiTok for a single 200 coin payment without starting playback", async ({
  page,
  context,
}) => {
  await open(page, { coins: 400 });
  const second = await context.newPage();
  await open(second, { seed: false });
  await misc(page);
  await misc(second);
  const a = await tile(page).getByRole("button").elementHandle(),
    b = await tile(second).getByRole("button").elementHandle();
  await Promise.all([
    a.evaluate((node) => node.click()),
    b.evaluate((node) => node.click()),
  ]);
  await expect(opener(page)).toBeVisible();
  await expect(opener(second)).toBeVisible();
  await expect(footerOpener(page)).toHaveCount(0);
  await expect(footerOpener(second)).toHaveCount(0);
  expect((await wallet(page)).coins).toBe(200);
  expect((await wallet(second)).coins).toBe(200);
  await expect(page.locator("video")).toHaveCount(0);
  await expect(second.locator("video")).toHaveCount(0);
  await second.close();
});

test("an external progress reset immediately closes the player and releases its video", async ({
  page,
}) => {
  await open(page, { owned: true });
  await startPlayer(page);
  await playing(page);
  await holdVideo(page);
  await page.evaluate((key) => {
    const value = JSON.parse(localStorage.getItem(key));
    localStorage.setItem(
      key,
      JSON.stringify({ ...value, purchases: {}, coins: 0 }),
    );
    window.dispatchEvent(new StorageEvent("storage", { key }));
  }, key);
  await released(page);
  await expect(opener(page)).toHaveCount(0);
  await expect(page.locator(".screenplay-editor")).toBeVisible();
});

test("a blocked autoplay remains a playable icon instead of pretending playback started", async ({
  page,
}) => {
  await open(page, { owned: true });
  await page.evaluate(() => {
    const play = HTMLMediaElement.prototype.play;
    let blocked = true;
    HTMLMediaElement.prototype.play = function () {
      if (blocked) {
        blocked = false;
        return Promise.reject(new DOMException("blocked", "NotAllowedError"));
      }
      return play.call(this);
    };
  });
  await startPlayer(page);
  await panel(page)
    .getByRole("button", { name: "Воспроизвести TikiTok", exact: true })
    .click();
  await playing(page);
});

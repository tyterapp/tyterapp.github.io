import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createProject } from "../src/data.js";
import { HOUSE_SKINS, HOUSE_SKIN_IDLE_MS } from "../src/house-skins.js";
import {
  cleanWalletExtras,
  purchaseWalletSkin,
  selectWalletSkin,
  walletHouseSkin,
  resetWalletProgress,
} from "../src/writing-wallet.js";
import { readHouseSnapshot } from "../src/house-snapshot.js";
import { grantPro } from "./helpers/pro-access.js";
import { openWritingShop } from "./helpers/writing-shop.js";

const ownedHouse = { "oiia-house": { cost: 100, purchasedAt: 1 } };
test("OiiA costs 50 once, requires ownership and balance, preserves selection, and resets with progress", () => {
  const wallet = { coins: 70, purchases: ownedHouse };
  expect(purchaseWalletSkin({ coins: 70 }, "oiia").ok).toBe(false);
  expect(
    purchaseWalletSkin({ ...wallet, coins: 49 }, "oiia").wallet.coins,
  ).toBe(49);
  expect(selectWalletSkin(wallet, "oiia").ok).toBe(false);
  expect(purchaseWalletSkin(wallet, "unknown").ok).toBe(false);
  const bought = purchaseWalletSkin(wallet, "oiia", 2).wallet;
  expect(bought.coins).toBe(20);
  expect(walletHouseSkin(bought)).toBe("oiia");
  expect(purchaseWalletSkin(bought, "oiia", 3).wallet).toBe(bought);
  expect(cleanWalletExtras(bought)).toEqual({
    purchases: { ...ownedHouse, "skin-oiia": { cost: 50, purchasedAt: 2 } },
    houseSkin: "oiia",
  });
  const empty = selectWalletSkin(bought, null).wallet;
  expect(walletHouseSkin(empty)).toBeNull();
  expect(selectWalletSkin(empty, "oiia").wallet.coins).toBe(20);
  expect(walletHouseSkin({ ...wallet, houseSkin: "oiia" })).toBeNull();
  expect(
    cleanWalletExtras({ ...wallet, houseSkin: "unknown" }).houseSkin,
  ).toBeUndefined();
  expect(
    walletHouseSkin(resetWalletProgress({ ...bought, coins: 200 }).wallet),
  ).toBeNull();
});

async function open(
  page,
  { language = "en", theme = "light", width = 1440, pro = false } = {},
) {
  await page.setViewportSize({ width, height: width < 832 ? 844 : 1000 });
  if (pro) await grantPro(page);
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  await page.addInitScript(
    ({ doc, language, theme }) => {
      if (localStorage.getItem("oiia-skin-seeded")) return;
      const date = new Date();
      const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      localStorage.setItem("tyter.projects.v1", JSON.stringify([doc]));
      localStorage.setItem("tyter.active", doc.id);
      localStorage.setItem("tyter.language.v1", language);
      localStorage.setItem(
        "tyter.editor-preferences.v1",
        JSON.stringify({ theme }),
      );
      localStorage.setItem("tyter.onboarding.v1", "done");
      localStorage.setItem(
        "tyter.writing-timer.v1",
        JSON.stringify({
          coins: 70,
          session: null,
          purchases: { "oiia-house": { cost: 100, purchasedAt: 1 } },
          streak: { day, count: 1, best: 1 },
        }),
      );
      localStorage.setItem("oiia-skin-seeded", "true");
    },
    { doc: createProject("OiiA"), language, theme },
  );
  await page.goto(pro ? "/pro" : "/free");
  await expect(page.locator(".screenplay-editor")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}
async function skins(page) {
  await openWritingShop(page);
  await page.getByRole("button", { name: /^(Скины|Skins)$/ }).click();
  return page.locator('#writing-shop [data-skin="oiia"]');
}
const wallet = (page) =>
  page.evaluate(() =>
    JSON.parse(localStorage.getItem("tyter.writing-timer.v1")),
  );

for (const options of [
  { language: "en", theme: "light", width: 1440 },
  { language: "ru", theme: "dark", width: 1440, pro: true },
  { language: "ru", theme: "light", width: 320 },
]) {
  test(`${options.language} ${options.width}px ${options.pro ? "Pro" : "Free"}: buy and switch OiiA, animate real writing, scale and share the complete skin snapshot`, async ({
    page,
    browser,
  }, info) => {
    await open(page, options);
    let tile = await skins(page);
    await expect(tile).toContainText(
      options.language === "en" ? "OiiA" : "ОииА",
    );
    expect((await tile.locator("img").boundingBox()).width).toBe(40);
    expect((await tile.locator("img").boundingBox()).height).toBe(40);
    await expect(tile).toContainText("50");
    await tile.click();
    await expect(tile).toHaveAttribute("aria-pressed", "true");
    await expect(tile.locator("svg.lucide-check")).toBeVisible();
    await page
      .locator("#writing-coins")
      .screenshot({ path: info.outputPath("oiia-shop.png") });
    expect((await wallet(page)).coins).toBe(20);
    await page.reload();
    tile = await skins(page);
    await expect(tile).toHaveAttribute("aria-pressed", "true");
    await page.locator('#writing-shop [data-skin="none"]').click();
    await expect(tile).toHaveAttribute("aria-pressed", "false");
    expect((await wallet(page)).houseSkin).toBeUndefined();
    await tile.click();
    await expect(tile).toHaveAttribute("aria-pressed", "true");
    expect((await wallet(page)).coins).toBe(20);
    await page
      .getByRole("button", { name: /^(Открыть oiia домик|Open oiia house)$/ })
      .click();
    const house = page.locator("#writing-house");
    const pet = house.locator(".writing-house-pet");
    const room = house.locator(".writing-house-room");
    await expect(pet).toHaveAttribute("src", HOUSE_SKINS[0].frames[0]);
    await page.evaluate(
      async (frames) =>
        Promise.all(
          frames.map(async (src) => {
            const image = new Image();
            image.src = src;
            await image.decode();
          }),
        ),
      HOUSE_SKINS[0].frames,
    );
    const { bounds, cat } = await house.evaluate((node) => {
      const box = ({ x, y, width, height }) => ({ x, y, width, height });
      return {
        bounds: box(
          node.querySelector(".writing-house-room").getBoundingClientRect(),
        ),
        cat: box(
          node.querySelector(".writing-house-pet").getBoundingClientRect(),
        ),
      };
    });
    expect((cat.x - bounds.x) / bounds.width).toBeCloseTo(199 / 536, 3);
    expect((cat.y - bounds.y) / bounds.height).toBeCloseTo(
      161 / ((536 * 468) / 734),
      3,
    );
    expect(cat.width / bounds.width).toBeCloseTo(137 / 536, 3);
    await house.screenshot({ path: info.outputPath("oiia-house.png") });
    if (options.width === 1440) {
      await house
        .getByRole("button", {
          name: /^(Увеличить домик до 200%|Expand house to 200%)$/,
        })
        .click();
      expect((await pet.boundingBox()).width).toBeCloseTo(
        cat.width * (536 / 256),
        0,
      );
      await house.screenshot({ path: info.outputPath("oiia-expanded.png") });
    }
    await page.clock.install();
    await page.clock.pauseAt(Date.now() + 1000);
    const editor = page.locator(".screenplay-editor");
    await editor.click();
    await expect(house).toBeVisible();
    await page.keyboard.insertText("a");
    await expect(pet).not.toHaveAttribute("data-frame", "0");
    await page.clock.fastForward(HOUSE_SKIN_IDLE_MS + 20);
    await expect(pet).toHaveAttribute("data-frame", "0");
    await editor.press("Control+z");
    await page.clock.fastForward(100);
    await expect(pet).toHaveAttribute("data-frame", "0");
    await page.keyboard.insertText("b");
    await expect(pet).not.toHaveAttribute("data-frame", "0");
    const capturedFrame = Number(await pet.getAttribute("data-frame"));
    await page.context().setOffline(true);
    await house
      .getByRole("button", {
        name: /^(Сделать снимок домика|Take a house snapshot)$/,
      })
      .click();
    const photo = page.locator("#writing-house-photo");
    const link = await photo.locator("input").inputValue();
    expect(link.length).toBeLessThan(200);
    expect(readHouseSnapshot(new URL(link).hash)).toMatchObject({
      skin: "oiia",
      frame: capturedFrame,
    });
    await page.clock.fastForward(HOUSE_SKIN_IDLE_MS + 20);
    await expect(pet).toHaveAttribute("data-frame", "0");
    const downloading = page.waitForEvent("download");
    await photo
      .getByRole("link", { name: /^(Скачать PNG|Download PNG)$/ })
      .click();
    const captured = await readFile(await (await downloading).path());
    await page.context().setOffline(false);
    const anonymous = await browser.newContext({ serviceWorkers: "block" });
    try {
      const visitor = await anonymous.newPage();
      await visitor.goto(link);
      await expect(
        visitor.locator(".house-snapshot-card > img"),
      ).toHaveAttribute("src", /^blob:/);
      const downloadingAgain = visitor.waitForEvent("download");
      await visitor
        .getByRole("link", { name: /^(Скачать PNG|Download PNG)$/ })
        .click();
      const shared = await readFile(await (await downloadingAgain).path());
      expect(shared.equals(captured)).toBe(true);
    } finally {
      await anonymous.close();
    }
  });
}

test("two tabs buying OiiA share one 50-coin charge and a saved selection", async ({
  page,
  context,
}) => {
  await open(page);
  const second = await context.newPage();
  await second.goto("/free");
  const [firstTile, secondTile] = await Promise.all([
    skins(page),
    skins(second),
  ]);
  await Promise.all([firstTile.click(), secondTile.click()]);
  await expect(firstTile).toHaveAttribute("aria-pressed", "true");
  await expect(secondTile).toHaveAttribute("aria-pressed", "true");
  expect((await wallet(page)).coins).toBe(20);
  await second.close();
});

test("failed wallet writes neither charge for OiiA nor change the selected skin", async ({
  page,
}) => {
  await open(page);
  const tile = await skins(page);
  const block = () =>
    page.evaluate(() => {
      window.skinWalletSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === "tyter.writing-timer.v1")
          throw new DOMException("Quota", "QuotaExceededError");
        return window.skinWalletSetItem.call(this, key, value);
      };
    });
  const restore = () =>
    page.evaluate(() => {
      Storage.prototype.setItem = window.skinWalletSetItem;
    });
  await block();
  await tile.click();
  await expect(page.locator("#writing-shop [role=alert]")).toBeVisible();
  expect((await wallet(page)).coins).toBe(70);
  expect((await wallet(page)).purchases["skin-oiia"]).toBeUndefined();
  await restore();
  await tile.click();
  await expect(tile).toHaveAttribute("aria-pressed", "true");
  await block();
  await page.locator('#writing-shop [data-skin="none"]').click();
  await expect(page.locator("#writing-shop [role=alert]")).toBeVisible();
  await expect(tile).toHaveAttribute("aria-pressed", "true");
  expect((await wallet(page)).houseSkin).toBe("oiia");
  expect((await wallet(page)).coins).toBe(20);
  await restore();
});

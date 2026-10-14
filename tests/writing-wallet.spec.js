import { test, expect } from "@playwright/test";
import { createProject } from "../src/data.js";
import { localDay } from "../src/daily-streak.js";
import {
  cleanWalletExtras,
  walletHasDoctor,
  purchaseWalletDoctor,
  walletHasHouse,
  purchaseWalletHouse,
  recordWalletWriting,
  recordWalletDeletion,
  queueDeletionConfirmation,
  pendingDeletionConfirmations,
  clearDeletionConfirmation,
  PENDING_DELETION_PREFIX,
} from "../src/writing-wallet.js";
import { WRITING_TIMER_STORAGE } from "../src/writing-timer.js";
import { grantPro } from "./helpers/pro-access.js";

test("writing rewards carry Unicode character counts and duplicate receipts do not reward twice", () => {
  let wallet = { coins: 0, session: { id: "timer" } };
  const first = recordWalletWriting(wallet, {
    id: "typing-1",
    scope: "doc::white",
    characters: Array.from("😀".repeat(99)).length,
  });
  expect(first.reward).toBe(0);
  wallet = first.wallet;
  const second = recordWalletWriting(wallet, {
    id: "typing-2",
    scope: "doc::blue",
    characters: 202,
  });
  expect(second.reward).toBe(30);
  expect(second.wallet.writing.characters % 100).toBe(1);
  expect(second.wallet.session).toEqual({ id: "timer" });
  expect(
    recordWalletWriting(second.wallet, {
      id: "typing-2",
      scope: "doc::blue",
      characters: 202,
    }).wallet,
  ).toBe(second.wallet);
  expect(
    recordWalletWriting(second.wallet, {
      id: "empty",
      scope: "doc",
      characters: -1,
    }).ok,
  ).toBe(false);
});

test("the doctor purchase costs 20 coins once and legacy wallets default to locked", () => {
  expect(walletHasDoctor({ coins: 500 })).toBe(false);
  expect(purchaseWalletDoctor({ coins: 19 }).ok).toBe(false);
  const result = purchaseWalletDoctor({ coins: 35, session: null }, 12345);
  expect(result.wallet.coins).toBe(15);
  expect(walletHasDoctor(result.wallet)).toBe(true);
  expect(purchaseWalletDoctor(result.wallet, 23456).wallet).toBe(result.wallet);
  expect(
    cleanWalletExtras({ ...result.wallet, streak: { count: 4 } }).purchases,
  ).toEqual({
    "script-doctor": { cost: 20, purchasedAt: 12345 },
  });
});

test("deletion confirmation receipts remain recoverable until persistence and duplicate recovery is harmless", () => {
  const entries = new Map();
  const storage = {
    get length() {
      return entries.size;
    },
    key: (index) => [...entries.keys()][index] ?? null,
    setItem: (key, value) => entries.set(key, value),
    getItem: (key) => entries.get(key) ?? null,
    removeItem: (key) => entries.delete(key),
  };
  const confirmation = queueDeletionConfirmation(
    {
      id: "pending:last",
      documentId: "doc",
      versionId: "blue",
      label: "v2 Blue",
      lastCopy: true,
    },
    storage,
    1791892800000,
  );
  expect(confirmation.ok).toBe(true);
  expect(pendingDeletionConfirmations(storage)).toHaveLength(1);
  const recovered = recordWalletDeletion(
    { coins: 0 },
    pendingDeletionConfirmations(storage)[0].receipt,
  );
  expect(recovered.reward).toBe(10);
  expect(pendingDeletionConfirmations(storage)).toHaveLength(1);
  expect(
    recordWalletDeletion(recovered.wallet, confirmation.receipt).reward,
  ).toBe(0);
  clearDeletionConfirmation(confirmation.key, storage);
  expect(pendingDeletionConfirmations(storage)).toHaveLength(0);
  expect(
    queueDeletionConfirmation(confirmation.receipt, {
      setItem() {
        throw new Error("blocked");
      },
    }).reason,
  ).toBe("storage");
});

test("the house costs 100 coins once, and cleaning preserves both purchases and writing rewards", () => {
  expect(walletHasHouse({ coins: 500 })).toBe(false);
  expect(purchaseWalletHouse({ coins: 99 }).ok).toBe(false);
  const doctor = purchaseWalletDoctor(
    { coins: 130, session: null },
    12345,
  ).wallet;
  const house = purchaseWalletHouse(doctor, 23456);
  expect(house.wallet.coins).toBe(10);
  expect(walletHasHouse(house.wallet)).toBe(true);
  expect(walletHasDoctor(house.wallet)).toBe(true);
  expect(purchaseWalletHouse(house.wallet, 34567).wallet).toBe(house.wallet);
  const written = recordWalletWriting(house.wallet, {
    id: "house-writing",
    scope: "doc",
    characters: 100,
  });
  expect(written.wallet.coins).toBe(20);
  expect(cleanWalletExtras(written.wallet).purchases).toEqual({
    "script-doctor": { cost: 20, purchasedAt: 12345 },
    "oiia-house": { cost: 100, purchasedAt: 23456 },
  });
});

test("confirmed deletions log each copy and award the scavenger achievement once across documents", () => {
  const first = recordWalletDeletion(
    { coins: 5 },
    {
      id: "remove-1",
      documentId: "doc-a",
      versionId: "blue",
      label: "v2 Blue",
      lastCopy: false,
    },
    new Date("2026-10-13T12:00:00Z").getTime(),
  );
  expect(first.reward).toBe(0);
  const last = recordWalletDeletion(
    first.wallet,
    {
      id: "remove-2",
      documentId: "doc-a",
      versionId: "pink",
      label: "v3 Pink",
      lastCopy: true,
    },
    new Date("2026-10-13T12:10:00Z").getTime(),
  );
  expect(last.reward).toBe(10);
  expect(last.wallet.coins).toBe(15);
  expect(last.wallet.deletions).toHaveLength(2);
  expect(last.wallet.deletions[1].deletedAt).toBe(
    new Date("2026-10-13T12:10:00Z").getTime(),
  );
  expect(last.wallet.achievements.scavenger.name).toBe("Мусорщик");
  expect(
    recordWalletDeletion(last.wallet, {
      id: "remove-3",
      documentId: "doc-b",
      versionId: "cherry",
      label: "v9 Cherry",
      lastCopy: true,
    }).reward,
  ).toBe(0);
  expect(
    recordWalletDeletion(last.wallet, {
      id: "remove-2",
      documentId: "doc-a",
      versionId: "pink",
      label: "v3 Pink",
      lastCopy: true,
    }).wallet,
  ).toBe(last.wallet);
  expect(cleanWalletExtras(last.wallet).deletions).toEqual(
    last.wallet.deletions,
  );
});

async function open(page, { theme = "light", coins = 20, seed = true } = {}) {
  await grantPro(page);
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  if (seed) {
    const doc = createProject("Магазин сценария");
    await page.addInitScript(
      ({ doc, theme, coins }) => {
        if (sessionStorage.getItem("wallet-seeded")) return;
        localStorage.setItem("tyter.projects.v1", JSON.stringify([doc]));
        localStorage.setItem("tyter.active", doc.id);
        localStorage.setItem("tyter.language.v1", "ru");
        localStorage.setItem("tyter.onboarding.v1", "done");
        localStorage.setItem(
          "tyter.editor-preferences.v1",
          JSON.stringify({ theme }),
        );
        const date = new Date();
        const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
        localStorage.setItem(
          "tyter.writing-timer.v1",
          JSON.stringify({
            coins,
            session: null,
            streak: { day, count: 1, best: 1 },
          }),
        );
        sessionStorage.setItem("wallet-seeded", "yes");
      },
      { doc, theme, coins },
    );
  }
  await page.goto("/beta");
  await expect(page.locator(".screenplay-editor")).toBeVisible();
}
const shop = (page) =>
  page.getByRole("dialog", { name: "Магазин", exact: true });
const openShop = (page) =>
  page.getByRole("button", { name: "Открыть магазин", exact: true }).click();
const purchase = (page) =>
  shop(page).getByRole("button", {
    name: "Купить доктора сценария за 20 монет",
    exact: true,
  });

for (const theme of ["light", "dark"]) {
  test(`${theme}: bottom shop purchases the doctor once, persists, and closes with Escape`, async ({
    page,
  }) => {
    await open(page, { theme });
    await expect(
      page.getByRole("button", { name: "Доктор сценария", exact: true }),
    ).toHaveCount(0);
    await openShop(page);
    await expect(purchase(page)).toBeEnabled();
    await purchase(page).click();
    await expect(purchase(page)).toHaveCount(0);
    await expect(page.locator(".writing-timer-balance > span")).toHaveText("0");
    await expect(
      page.getByRole("button", { name: "Доктор сценария", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(shop(page)).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Открыть магазин", exact: true }),
    ).toBeFocused();
    await page.reload();
    await openShop(page);
    await expect(purchase(page)).toHaveCount(0);
    const wallet = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)),
      WRITING_TIMER_STORAGE,
    );
    expect(wallet.purchases["script-doctor"].cost).toBe(20);
    expect(wallet.coins).toBe(0);
    expect(wallet.streak.day).toBe(localDay());
  });
}

test("320px: the shop stays inside the viewport and unaffordable purchases are disabled", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await open(page, { theme: "dark", coins: 19 });
  await openShop(page);
  await expect(purchase(page)).toBeDisabled();
  await expect(shop(page)).toContainText("100 написанных символов = 10 монет");
  const bounds = await shop(page).boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  const target = await purchase(page).boundingBox();
  expect(target.height).toBeGreaterThanOrEqual(44);
  await shop(page)
    .getByRole("button", { name: "Закрыть магазин", exact: true })
    .click();
  await expect(shop(page)).toHaveCount(0);
});

test("two tabs buying simultaneously spend only one doctor price", async ({
  page,
  context,
}) => {
  await open(page, { coins: 40 });
  const second = await context.newPage();
  await open(second, { seed: false });
  await openShop(page);
  await openShop(second);
  const firstButton = await purchase(page).elementHandle();
  const secondButton = await purchase(second).elementHandle();
  await Promise.all([
    firstButton.evaluate((node) => node.click()),
    secondButton.evaluate((node) => node.click()),
  ]);
  await expect(purchase(page)).toHaveCount(0);
  await expect(purchase(second)).toHaveCount(0);
  await expect(page.locator(".writing-timer-balance > span")).toHaveText("20");
  await expect(second.locator(".writing-timer-balance > span")).toHaveText(
    "20",
  );
  await second.close();
});

for (const theme of ["light", "dark"]) {
  test(`${theme}: house purchase opens the room, persists, hides owned goods, and categories do not spend coins`, async ({
    page,
  }) => {
    await open(page, { theme, coins: 120 });
    const houseButton = page.getByRole("button", {
      name: "Открыть oiia домик",
      exact: true,
    });
    await expect(houseButton).toHaveCount(0);
    await openShop(page);
    await shop(page)
      .getByRole("button", {
        name: "Купить oiia домик за 100 монет",
        exact: true,
      })
      .click();
    await expect(page.locator(".writing-timer-balance-content")).toHaveText(
      "20",
    );
    await expect(
      shop(page).getByRole("button", {
        name: "Купить oiia домик за 100 монет",
        exact: true,
      }),
    ).toHaveCount(0);
    await houseButton.click();
    const room = page.getByRole("dialog", { name: "oiia домик", exact: true });
    await expect(room).toBeVisible();
    await expect(shop(page)).toHaveCount(0);
    await expect
      .poll(() =>
        room.locator("img").evaluate((img) => img.complete && img.naturalWidth),
      )
      .toBe(734);
    expect(
      (await page.locator(".writing-timer-balance").boundingBox()).height,
    ).toBe((await houseButton.boundingBox()).height);
    await page.screenshot({ path: `.cache/house-${theme}.png` });
    await page.keyboard.press("Escape");
    await expect(room).toHaveCount(0);
    await expect(houseButton).toBeFocused();
    await openShop(page);
    await purchase(page).click();
    await expect(purchase(page)).toHaveCount(0);
    for (const [name, item] of [
      ["Скины", "Классическая кошка"],
      ["Декор", "Уютный коврик"],
      ["Разное", "Подарочная коробка"],
    ]) {
      await shop(page).getByRole("button", { name, exact: true }).click();
      await expect(shop(page)).toContainText(item);
      await shop(page).getByText(item, { exact: true }).click();
      await expect(page.locator(".writing-timer-balance-content")).toHaveText(
        "0",
      );
      await shop(page)
        .getByRole("button", { name: "Назад к категориям", exact: true })
        .click();
      await expect(
        shop(page).getByRole("button", { name, exact: true }),
      ).toBeFocused();
    }
    await page.screenshot({ path: `.cache/shop-categories-${theme}.png` });
    await page.reload();
    await expect(houseButton).toBeVisible();
    await openShop(page);
    await expect(shop(page).locator(".writing-shop-product")).toHaveCount(0);
    await expect(shop(page).locator(".writing-shop-category")).toHaveCount(3);
    await expect(page.locator(".writing-timer-balance-content")).toHaveText(
      "0",
    );
  });
}

test("320px: the house and wallet fit the viewport, including a short keyboard viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await open(page, { coins: 100, theme: "dark" });
  await openShop(page);
  await shop(page)
    .getByRole("button", {
      name: "Купить oiia домик за 100 монет",
      exact: true,
    })
    .click();
  const button = page.getByRole("button", {
    name: "Открыть oiia домик",
    exact: true,
  });
  await button.click();
  const room = page.getByRole("dialog", { name: "oiia домик", exact: true });
  await expect
    .poll(() =>
      room.locator("img").evaluate((img) => img.complete && img.naturalWidth),
    )
    .toBe(734);
  for (const height of [720, 360]) {
    await page.setViewportSize({ width: 320, height });
    await expect(room).toBeVisible();
    const bounds = await room.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(height);
  }
  expect((await button.boundingBox()).height).toBe(44);
  expect(
    (await page.locator(".writing-timer-balance").boundingBox()).height,
  ).toBe(44);
  await page.screenshot({ path: ".cache/house-mobile.png" });
});

test("a failed house save neither spends coins nor unlocks the house", async ({
  page,
}) => {
  await open(page, { coins: 120 });
  await page.evaluate(() => {
    const save = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "tyter.writing-timer.v1")
        throw new DOMException("Full", "QuotaExceededError");
      return save.call(this, key, value);
    };
  });
  await openShop(page);
  await shop(page)
    .getByRole("button", {
      name: "Купить oiia домик за 100 монет",
      exact: true,
    })
    .click();
  await expect(shop(page).getByRole("alert")).toContainText(
    "Не удалось сохранить покупку",
  );
  await expect(
    page.getByRole("button", { name: "Открыть oiia домик", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".writing-timer-balance-content")).toHaveText(
    "120",
  );
});

test("two tabs buying the house simultaneously spend 100 coins only once", async ({
  page,
  context,
}) => {
  await open(page, { coins: 200 });
  const second = await context.newPage();
  await open(second, { seed: false });
  await openShop(page);
  await openShop(second);
  const button = (target) =>
    shop(target).getByRole("button", {
      name: "Купить oiia домик за 100 монет",
      exact: true,
    });
  const firstButton = await button(page).elementHandle();
  const secondButton = await button(second).elementHandle();
  await Promise.all([
    firstButton.evaluate((node) => node.click()),
    secondButton.evaluate((node) => node.click()),
  ]);
  await expect(button(page)).toHaveCount(0);
  await expect(button(second)).toHaveCount(0);
  await expect(page.locator(".writing-timer-balance-content")).toHaveText(
    "100",
  );
  await expect(second.locator(".writing-timer-balance-content")).toHaveText(
    "100",
  );
  await second.close();
});

test("startup recovers a deletion interrupted before its wallet lock completed exactly once", async ({
  page,
}) => {
  await page.addInitScript(
    ({ prefix }) => {
      if (sessionStorage.getItem("deletion-wal-seeded")) return;
      const now = Date.now();
      const date = new Date(now);
      const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      const receipt = {
        id: "closed-tab-deletion",
        documentId: "closed-document",
        versionId: "blue",
        label: "v2 Blue",
        date: day,
        deletedAt: now,
        lastCopy: true,
      };
      localStorage.setItem(
        `${prefix}${encodeURIComponent(receipt.id)}`,
        JSON.stringify(receipt),
      );
      sessionStorage.setItem("deletion-wal-seeded", "yes");
    },
    { prefix: PENDING_DELETION_PREFIX },
  );
  await open(page, { coins: 0 });
  await expect(page.locator(".writing-timer-balance > span")).toHaveText("10");
  const recovered = await page.evaluate(
    ({ key, prefix }) => ({
      wallet: JSON.parse(localStorage.getItem(key)),
      pending: Object.keys(localStorage).filter((key) =>
        key.startsWith(prefix),
      ),
    }),
    { key: WRITING_TIMER_STORAGE, prefix: PENDING_DELETION_PREFIX },
  );
  expect(recovered.wallet.deletions).toHaveLength(1);
  expect(recovered.wallet.deletions[0].id).toBe("closed-tab-deletion");
  expect(recovered.wallet.achievements.scavenger.reward).toBe(10);
  expect(recovered.pending).toHaveLength(0);
  await page.reload();
  await expect(page.locator(".writing-timer-balance > span")).toHaveText("10");
  const afterReload = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    WRITING_TIMER_STORAGE,
  );
  expect(afterReload.deletions).toHaveLength(1);
});

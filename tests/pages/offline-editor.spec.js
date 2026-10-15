import { openWritingShop } from "../helpers/writing-shop.js";
import { test, expect } from "@playwright/test";
import { createProject } from "../../src/data.js";
import { PRO_VERIFIED_STORAGE } from "../../src/pro-access.js";
import { grantPro } from "../helpers/pro-access.js";

test("the installed editor reloads offline, keeps document changes and loads the house and lazy outline", async ({
  page,
  context,
}) => {
  const doc = createProject("Без интернета");
  await grantPro(page);
  await page.addInitScript((doc) => {
    if (sessionStorage.getItem("offline-seeded")) return;
    localStorage.setItem("tyter.projects.v1", JSON.stringify([doc]));
    localStorage.setItem("tyter.active", doc.id);
    localStorage.setItem("tyter.language.v1", "ru");
    localStorage.setItem(
      "tyter.writing-timer.v1",
      JSON.stringify({ coins: 120, session: null }),
    );
    sessionStorage.setItem("offline-seeded", "yes");
  }, doc);
  await page.goto("/beta");
  await expect(page.locator(".screenplay-editor")).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise((resolve) =>
        navigator.serviceWorker.addEventListener("controllerchange", resolve, {
          once: true,
        }),
      );
  });
  const stored = await page.evaluate(() =>
    localStorage.getItem("tyter.webPro.verified.v1"),
  );
  expect(stored).toMatch(/^[a-f0-9]{64}$/);
  const cachedUrls = await page.evaluate(async () => {
    const cache = await caches.open(
      (await caches.keys()).find((key) => key.startsWith("tyter-editor-")),
    );
    return (await cache.keys()).map((request) => request.url);
  });
  expect(cachedUrls.some((url) => url.includes("codes-for-pro"))).toBe(false);
  expect(cachedUrls.some((url) => url.includes("/oiia/house.png"))).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".screenplay-editor")).toBeVisible();
  const paragraph = page.locator(".screenplay-editor p").first();
  await paragraph.click();
  await page.keyboard.press("Home");
  await page.keyboard.insertText("ОФЛАЙН СОХРАНЕНО ");
  await page.evaluate(() => window.dispatchEvent(new Event("tyter:save-now")));
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise((resolve, reject) => {
            const open = indexedDB.open("tyter.local-files.v1", 1);
            open.onsuccess = () => {
              const database = open.result;
              const request = database
                .transaction("files")
                .objectStore("files")
                .get("documents");
              request.onsuccess = () => {
                resolve(
                  JSON.stringify(request.result || []).includes(
                    "ОФЛАЙН СОХРАНЕНО",
                  ),
                );
                database.close();
              };
              request.onerror = () => {
                reject(request.error);
                database.close();
              };
            };
            open.onerror = () => reject(open.error);
          }),
      ),
    )
    .toBe(true);
  await page.reload();
  await expect(paragraph).toContainText("ОФЛАЙН СОХРАНЕНО");
  await page.getByRole("button", { name: "Аутлайн", exact: true }).click();
  await expect(page.locator(".outline-layout")).toBeVisible();
  await page.getByRole("button", { name: "Сценарий", exact: true }).click();
  await openWritingShop(page);
  await page
    .getByRole("button", {
      name: "Купить oiia домик за 100 монет",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Открыть oiia домик", exact: true })
    .click();
  const image = page
    .getByRole("dialog", { name: "oiia домик", exact: true })
    .locator("img");
  await expect
    .poll(() => image.evaluate((img) => img.complete && img.naturalWidth))
    .toBe(734);
  // Signing out discards the verification receipt even without an internet connection.
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Выйти из аккаунта", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Вход в Pro" })).toBeVisible();
  expect(
    await page.evaluate(
      (key) => localStorage.getItem(key),
      PRO_VERIFIED_STORAGE,
    ),
  ).toBeNull();
});

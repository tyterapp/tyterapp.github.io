import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createProject } from "../src/data.js";
import {
  HOUSE_ROOM,
  houseSnapshotLink,
  readHouseSnapshot,
} from "../src/house-snapshot.js";
import { grantPro } from "./helpers/pro-access.js";

async function open(page, { theme = "light", width = 1440 } = {}) {
  await page.setViewportSize({ width, height: width < 832 ? 844 : 1000 });
  await grantPro(page);
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript(
    ({ doc, theme }) => {
      const date = new Date();
      const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      localStorage.setItem("tyter.projects.v1", JSON.stringify([doc]));
      localStorage.setItem("tyter.active", doc.id);
      localStorage.setItem("tyter.language.v1", "ru");
      localStorage.setItem(
        "tyter.editor-preferences.v1",
        JSON.stringify({ theme }),
      );
      localStorage.setItem(
        "tyter.writing-timer.v1",
        JSON.stringify({
          coins: 10,
          session: null,
          streak: { day, count: 1, best: 1 },
          purchases: { "oiia-house": { purchasedAt: Date.now(), cost: 100 } },
        }),
      );
    },
    { doc: createProject("Личный текст не входит в снимок"), theme },
  );
  await page.goto("/beta");
  await page.bringToFront();
  await expect(page.locator(".screenplay-editor")).toBeVisible();
  await page
    .getByRole("button", { name: "Открыть oiia домик", exact: true })
    .click();
  await expect
    .poll(() =>
      page
        .locator("#writing-house img")
        .evaluate((img) => img.complete && img.naturalWidth),
    )
    .toBe(734);
}
const house = (page) => page.locator("#writing-house");
const camera = (page) =>
  house(page).getByRole("button", {
    name: "Сделать снимок домика",
    exact: true,
  });
const photo = (page) => page.locator("#writing-house-photo");
const imagePixels = (locator) =>
  locator.evaluate(async (image) => {
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    const bytes = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const hash = [
      ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    ]
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("");
    return { width: canvas.width, height: canvas.height, hash };
  });
async function downloadedBytes(page, link) {
  const downloading = page.waitForEvent("download");
  await link.click();
  const file = await downloading;
  expect(file.suggestedFilename()).toMatch(/^oiia-house-.*\.png$/);
  return readFile(await file.path());
}

test("snapshot links are short, versioned and exclude document or account data; unsupported payloads are rejected", () => {
  const snapshot = {
    version: 1,
    takenAt: 1791975600000,
    document: "private",
    coins: 100,
  };
  const link = houseSnapshotLink(
    snapshot,
    "https://tyterapp.github.io/beta?private=secret#proof",
  );
  expect(link.length).toBeLessThan(200);
  expect(link).toMatch(/^https:\/\/tyterapp.github.io\/house#snapshot=/);
  expect(link).not.toContain("private");
  expect(readHouseSnapshot(new URL(link).hash)).toEqual({
    version: 1,
    takenAt: snapshot.takenAt,
  });
  expect(houseSnapshotLink(snapshot, "tyter://app/index.html")).toBe(link);
  expect(readHouseSnapshot("#snapshot=bad")).toBeNull();
  expect(readHouseSnapshot("#snapshot=" + "x".repeat(2000))).toBeNull();
  for (const invalid of [
    { version: 2, takenAt: 1 },
    { version: 1, takenAt: -1 },
    { version: 1, takenAt: "2026-10-14" },
    { version: 1, takenAt: 1, skin: "https://example.com/other.png", frame: 0 },
    { version: 1, takenAt: 1, skin: "oiia", frame: 4 },
    { version: 1, takenAt: 1, skin: "oiia", frame: -1 },
    { version: 1, takenAt: 1, frame: 0 },
  ]) {
    expect(
      readHouseSnapshot("#snapshot=" + btoa(JSON.stringify(invalid))),
    ).toBeNull();
    expect(() => houseSnapshotLink(invalid)).toThrow();
  }
});

for (const [theme, width] of [
  ["light", 1440],
  ["dark", 320],
]) {
  test(`${theme} ${width}px: camera downloads the complete room offline, and its link works in a separate anonymous browser`, async ({
    page,
    browser,
  }, info) => {
    await open(page, { theme, width });
    const pixels = await imagePixels(house(page).locator("img"));
    const wallet = await page.evaluate(() =>
      localStorage.getItem("tyter.writing-timer.v1"),
    );
    await house(page)
      .getByRole("button", { name: "Увеличить домик до 200%", exact: true })
      .click();
    await house(page)
      .locator(".writing-popover-scroll")
      .evaluate((el) => {
        el.scrollLeft = el.scrollWidth;
        el.scrollTop = el.scrollHeight;
      });
    await page.context().setOffline(true);
    await camera(page).click();
    await expect(photo(page)).toContainText("Снимок готов");
    await expect(camera(page)).toHaveAttribute("aria-busy", "false");
    await expect(
      photo(page).getByRole("link", { name: "Скачать PNG", exact: true }),
    ).toBeInViewport();
    await expect(
      photo(page).getByRole("button", {
        name: "Копировать ссылку",
        exact: true,
      }),
    ).toBeInViewport();
    const bytes = await downloadedBytes(
      page,
      photo(page).getByRole("link", { name: "Скачать PNG", exact: true }),
    );
    expect([...bytes.subarray(0, 8)]).toEqual([
      137, 80, 78, 71, 13, 10, 26, 10,
    ]);
    const captured = await page.evaluate(async (base64) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      const hash = [
        ...new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            context.getImageData(0, 0, canvas.width, canvas.height).data,
          ),
        ),
      ]
        .map((n) => n.toString(16).padStart(2, "0"))
        .join("");
      return { width: canvas.width, height: canvas.height, hash };
    }, bytes.toString("base64"));
    expect(captured).toEqual(pixels);
    await photo(page)
      .getByRole("button", { name: "Копировать ссылку", exact: true })
      .click();
    await expect(photo(page).getByRole("status")).toHaveText(
      "Ссылка скопирована",
    );
    await expect(
      photo(page).getByRole("button", {
        name: "Копировать ссылку",
        exact: true,
      }),
    ).toHaveText("Ссылка скопирована");
    const link = await page.evaluate(() => navigator.clipboard.readText());
    expect(link).toBe(
      await photo(page)
        .getByLabel("Ссылка на снимок", { exact: true })
        .inputValue(),
    );
    expect(link.length).toBeLessThan(200);
    expect(
      await page.evaluate(() => localStorage.getItem("tyter.writing-timer.v1")),
    ).toBe(wallet);
    await expect(
      house(page).getByRole("button", { name: "Закрыть домик", exact: true }),
    ).toBeInViewport();
    await house(page).screenshot({
      path: info.outputPath("camera-actions.png"),
    });
    await page.context().setOffline(false);

    const anonymous = await browser.newContext({
      serviceWorkers: "block",
      viewport: { width, height: 844 },
    });
    try {
      const visitor = await anonymous.newPage();
      const requests = [];
      visitor.on("request", (request) => requests.push(request.url()));
      await visitor.goto(link);
      const image = visitor.getByAltText("Снимок домика", { exact: true });
      await expect(image).toBeVisible();
      expect(await imagePixels(image)).toEqual(pixels);
      await expect(visitor.locator(".screenplay-editor")).toHaveCount(0);
      expect(
        await visitor.evaluate(() =>
          localStorage.getItem("tyter.writing-timer.v1"),
        ),
      ).toBeNull();
      expect(
        requests.some(
          (url) =>
            url.includes("codes-for-pro") || url.includes("__tyter_local"),
        ),
      ).toBe(false);
      const publicDownload = await downloadedBytes(
        visitor,
        visitor.getByRole("link", { name: "Скачать PNG", exact: true }),
      );
      expect(publicDownload).toEqual(
        await readFile(
          new URL(`../public${HOUSE_ROOM.image}`, import.meta.url),
        ),
      );
      await visitor.screenshot({
        path: info.outputPath("shared-snapshot.png"),
      });
    } finally {
      await anonymous.close();
    }
  });
}

test("clipboard refusal leaves a manually selectable link; native sharing cancellation keeps the snapshot and English labels", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new DOMException("Denied", "NotAllowedError");
        },
      },
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data) => {
        window.sharedSnapshot = data;
        throw new DOMException("Cancelled", "AbortError");
      },
    });
  });
  await open(page);
  await camera(page).click();
  await expect(photo(page)).toBeVisible();
  await photo(page)
    .getByRole("button", { name: "Копировать ссылку", exact: true })
    .click();
  const link = photo(page).getByLabel("Ссылка на снимок", { exact: true });
  await expect(link).toBeFocused();
  expect(await link.evaluate((el) => el.selectionEnd - el.selectionStart)).toBe(
    (await link.inputValue()).length,
  );
  await expect(photo(page).getByRole("status")).toHaveText(
    "Скопируйте ссылку из поля.",
  );
  await photo(page)
    .getByRole("button", { name: "Поделиться снимком", exact: true })
    .click();
  expect(await page.evaluate(() => window.sharedSnapshot.url)).toBe(
    await link.inputValue(),
  );
  await expect(house(page).getByRole("alert")).toHaveCount(0);
  await house(page)
    .getByRole("button", { name: "Закрыть домик", exact: true })
    .click();
  await page.getByRole("button", { name: "ENG", exact: true }).click();
  await page
    .getByRole("button", { name: "Open oiia house", exact: true })
    .click();
  await house(page)
    .getByRole("button", { name: "Take a house snapshot", exact: true })
    .click();
  await expect(
    photo(page).getByRole("link", { name: "Download PNG", exact: true }),
  ).toBeVisible();
});

test("invalid public snapshot links show a readable error without opening an editor or account", async ({
  page,
}) => {
  await page.goto("/house#snapshot=invalid");
  await expect(page.getByRole("alert")).toContainText("Снимок не найден");
  await expect(page.locator(".house-snapshot-card > img")).toHaveCount(0);
  await expect(page.locator(".screenplay-editor")).toHaveCount(0);
});

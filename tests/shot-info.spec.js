import { test, expect } from "@playwright/test";
import { createProject, validateImport } from "../src/data.js";
import { switchSceneVariant } from "../src/scene-variants.js";
import { switchScriptVersion } from "../src/script-versions.js";
import {
  shotScenes,
  updateShotSettings,
  sceneDuration,
  SHOT_FIELDS,
  cleanShootingDate,
  cleanShotLocation,
} from "../src/shot-info.js";
import { SCENE_TIMES, sceneTimeOfDay } from "../src/scene-times.js";
import { inspectScript } from "../src/script-doctor.js";
import { grantPro } from "./helpers/pro-access.js";
import { selectAppOption } from "./helpers/app-select.js";

const p = (format, text, blockId, sceneVariant) => ({
  type: "paragraph",
  attrs: { format, blockId, ...(sceneVariant ? { sceneVariant } : {}) },
  ...(text ? { content: [{ type: "text", text }] } : {}),
});
function fixture() {
  const doc = createProject("Информация о кадрах");
  doc.id = "shot-info-test";
  doc.content.content = [
    p("scene", "ИНТ. КАФЕ — ДЕНЬ", "scene", "A"),
    p("action", "Анна подходит к окну.", "action"),
    p("character", "АННА", "character"),
    p("parenthetical", "(тихо)", "parenthetical"),
    p("speech", "Мы увидимся на рассвете.", "dialogue"),
    p("transition", "ЗАТЕМНЕНИЕ:", "transition"),
    p("plain", "Проверить движение камеры.", "plain"),
    p("scene", "ЭКС. САД — НОЧЬ", "garden", "A"),
    p("action", "Тихий сад. ".repeat(280), "garden-action"),
  ];
  doc.sceneVariants = {
    scene: {
      F: [
        p("scene", "ИНТ. КАФЕ — СУМЕРКИ", "scene", "F"),
        p("action", "Другая встреча. ".repeat(90), "f-action"),
      ],
    },
  };
  return doc;
}
const drawer = (page) =>
  page.getByRole("complementary", { name: "Информация о кадре", exact: true });
const shotButton = (page) =>
  page.getByRole("button", { name: "Информация о кадре сцены 1", exact: true });
async function open(
  page,
  { theme = "light", width = 1440, doc = fixture() } = {},
) {
  await page.setViewportSize({ width, height: width < 832 ? 844 : 1000 });
  await grantPro(page);
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  // Keep automated tests off the public map tile service.
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.fulfill({
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
        "base64",
      ),
    }),
  );
  await page.addInitScript(
    ({ doc, theme }) => {
      if (sessionStorage.getItem("shot-seeded")) return;
      sessionStorage.setItem("shot-seeded", "yes");
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
  await page.goto("/beta");
  await expect(page.locator(".screenplay-editor")).toBeVisible();
}
async function stored(page) {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        const request = indexedDB.open("tyter.local-files.v1", 1);
        request.onsuccess = () => {
          const db = request.result,
            read = db
              .transaction("files")
              .objectStore("files")
              .get("documents");
          read.onsuccess = () => {
            resolve(read.result?.find((doc) => doc.id === "shot-info-test"));
            db.close();
          };
        };
      }),
  );
}

async function uploadedImage(page, reverse = false) {
  return Buffer.from(
    await page.evaluate((reverse) => {
      const canvas = document.createElement("canvas");
      canvas.width = 600;
      canvas.height = 300;
      const ctx = canvas.getContext("2d");
      if (reverse) {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      for (const [color, x, width] of [
        ["#1645e8", 0, 150],
        ["#16a34a", 150, 300],
        ["#e83016", 450, 150],
      ]) {
        ctx.fillStyle = color;
        ctx.fillRect(x, 0, width, 300);
      }
      return canvas.toDataURL("image/png").split(",")[1];
    }, reverse),
    "base64",
  );
}

test("shot settings survive import, remain isolated by variant and script version, and duration uses full screenplay pages", () => {
  let doc = updateShotSettings(fixture(), "scene", "A", {
    name: "Встреча у окна",
    aspectRatio: "2.39",
    people: "2",
    shootingDate: "2026-10-21",
    location: { name: "Кафе", latitude: 55.751244, longitude: 37.618423 },
  });
  doc = updateShotSettings(doc, "scene", "F", {
    name: "Вечерняя встреча",
    frameSize: "close",
  });
  const white = structuredClone(doc);
  doc = switchScriptVersion(doc, "blue");
  doc = updateShotSettings(doc, "scene", "A", { name: "Синяя версия" });
  doc = switchScriptVersion(doc, "white");
  expect(doc.sceneShots).toEqual(white.sceneShots);
  expect(doc.scriptVersions.blue.sceneShots.scene.A.name).toBe("Синяя версия");
  const clean = validateImport(doc);
  expect(clean.sceneShots).toEqual(doc.sceneShots);
  expect(clean.scriptVersions.blue.sceneShots).toEqual(
    doc.scriptVersions.blue.sceneShots,
  );
  expect(
    shotScenes(switchSceneVariant(doc, "scene", "F"))[0].settings.name,
  ).toBe("Вечерняя встреча");
  expect(
    shotScenes(doc, { allVariants: true }).map(
      (scene) => `${scene.number}${scene.letter}`,
    ),
  ).toEqual(["1A", "1F", "2A"]);
  const scene = shotScenes(doc)[0];
  expect(scene.seconds).toBe(Math.round(scene.pages * 60));
  expect(
    shotScenes({ ...doc, metadata: { ...doc.metadata, documentZoom: 200 } })[0]
      .seconds,
  ).toBe(scene.seconds);
  expect(
    sceneDuration([p("action", "Реплика. ".repeat(300), "long")]).seconds,
  ).toBeGreaterThan(scene.seconds);
  const unsafe = structuredClone(doc);
  unsafe.sceneShots.scene.A = {
    name: "Сохранить",
    aspectRatio: "<script>",
    image: "javascript:alert(1)",
    shootingDate: "2026-02-30",
    location: { latitude: 91, longitude: 180 },
  };
  expect(validateImport(unsafe).sceneShots.scene.A).toEqual({
    name: "Сохранить",
  });
  expect(
    updateShotSettings(doc, "scene", "A", null).sceneShots.scene.A,
  ).toBeUndefined();
  for (const [id, ru, en] of SCENE_TIMES) {
    expect(sceneTimeOfDay(`ИНТ. ДОМ — ${ru}`)).toBe(id);
    expect(sceneTimeOfDay(`INT. HOUSE — ${en}`)).toBe(id);
    expect(
      inspectScript({
        content: [
          p("scene", `ИНТ. ДОМ — ${ru}`, "scene"),
          p("action", "Действие.", "body"),
        ],
      }).some((item) => item.title === "Не указано время суток"),
    ).toBe(false);
  }
  expect(sceneTimeOfDay("INT. DAYTON")).toBe("");
  expect(cleanShootingDate("2028-02-29")).toBe("2028-02-29");
  expect(cleanShootingDate("2026-02-29")).toBe("");
  expect(cleanShootingDate("0000-01-01")).toBe("");
  expect(cleanShotLocation({ latitude: 0, longitude: 0 })).toEqual({
    latitude: 0,
    longitude: 0,
  });
  expect(cleanShotLocation({ latitude: 0, longitude: Infinity })).toBeNull();
  expect(cleanShotLocation({ latitude: "0", longitude: 0 })).toBeNull();
});

for (const theme of ["light", "dark"])
  test(`${theme}: shot drawer saves per-variant settings, keeps the screenplay view and links to blocks`, async ({
    page,
  }, info) => {
    test.setTimeout(45000);
    await open(page, { theme });
    await page.mouse.move(100, 800);
    await expect(shotButton(page)).toHaveCSS("opacity", "0.2");
    await expect(shotButton(page).locator("svg")).toHaveCount(1);
    await expect(shotButton(page).locator("img")).toHaveCount(0);
    expect((await shotButton(page).boundingBox()).width).toBe(48);
    expect((await shotButton(page).boundingBox()).height).toBe(48);
    await shotButton(page).hover();
    await expect(shotButton(page)).toHaveCSS("opacity", "1");
    await shotButton(page).click();
    const panel = drawer(page);
    await expect(panel).toBeVisible();
    await expect(panel.locator(".shot-reference img")).toHaveCount(0);
    await expect(
      panel.getByRole("button", { name: "Загрузить кадр", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".screenplay-editor")).toBeVisible();
    await expect(
      panel.getByRole("combobox", { name: "Время суток", exact: true }),
    ).toContainText("ДЕНЬ · из заголовка");
    await expect(panel.getByRole("combobox")).toHaveCount(1);
    for (const field of SHOT_FIELDS.filter(
      (field) => field.key !== "timeOfDay",
    ))
      await expect(
        panel.locator(`[data-property="${field.key}"] .shot-property-heading`),
      ).toHaveAttribute("aria-expanded", "false");
    await expect(
      panel.getByRole("button", { name: "Название шота", exact: true }),
    ).toHaveAttribute("aria-expanded", "false");
    for (const name of ["Дата съёмок", "Локация съёмок"])
      await expect(
        panel.getByRole("button", { name, exact: true }),
      ).toHaveAttribute("aria-expanded", "false");
    await panel
      .getByRole("button", { name: "Развернуть все свойства", exact: true })
      .click();
    await expect(panel.getByRole("combobox")).toHaveCount(SHOT_FIELDS.length);
    await panel
      .getByRole("button", { name: "Свернуть все свойства", exact: true })
      .click();
    await expect(panel.getByRole("combobox")).toHaveCount(0);
    await panel
      .getByRole("button", { name: "Название шота", exact: true })
      .click();
    await panel
      .getByRole("textbox", { name: "Название шота", exact: true })
      .fill("Встреча у окна");
    await panel
      .getByRole("button", { name: "Дата съёмок", exact: true })
      .click();
    await panel.getByLabel("Дата съёмок", { exact: true }).fill("2026-10-21");
    await panel
      .getByRole("button", { name: "Локация съёмок", exact: true })
      .click();
    const map = panel.getByRole("region", { name: "Карта локации съёмок" });
    await expect(map.locator(".leaflet-tile-pane")).toBeAttached();
    await expect(
      map.getByRole("link", { name: "OpenStreetMap", exact: true }),
    ).toBeVisible();
    await map.click({ position: { x: 210, y: 120 } });
    await expect(panel.locator(".shot-location-value")).toBeVisible();
    await panel
      .getByLabel("Название локации", { exact: true })
      .fill("Кафе у вокзала");
    await panel.getByLabel("Широта", { exact: true }).fill("91");
    await panel.getByLabel("Долгота", { exact: true }).fill("37.618423");
    await panel
      .getByRole("button", { name: "Применить координаты", exact: true })
      .click();
    await expect(panel.getByRole("alert")).toContainText("Широта");
    await panel.getByLabel("Широта", { exact: true }).fill("55,751244");
    await panel
      .getByRole("button", { name: "Применить координаты", exact: true })
      .click();
    await expect(panel.getByRole("alert")).toHaveCount(0);
    await expect(panel.locator(".shot-location-value")).toContainText(
      "55.751244, 37.618423",
    );
    await panel
      .getByRole("button", { name: "Формат кадра", exact: true })
      .click();
    await selectAppOption(
      page,
      panel.getByRole("combobox", { name: "Формат кадра", exact: true }),
      "2.39",
    );
    await panel.locator('input[type="file"]').setInputFiles({
      name: "my-shot.png",
      mimeType: "image/png",
      buffer: await uploadedImage(page),
    });
    await expect(
      panel.getByAltText("Прикреплённый пример кадра"),
    ).toBeVisible();
    const original = await panel
      .getByAltText("Прикреплённый пример кадра")
      .getAttribute("src");
    await expect(shotButton(page).locator("img")).toHaveAttribute(
      "src",
      original,
    );
    await expect(shotButton(page).locator("svg")).toHaveCount(0);
    for (const [format, ratio] of [
      ["2.39", 2.39],
      ["1:1", 1],
      ["9:16", 9 / 16],
    ]) {
      await selectAppOption(
        page,
        panel.getByRole("combobox", { name: "Формат кадра", exact: true }),
        format,
      );
      const rect = await panel.locator(".shot-image-frame").boundingBox();
      expect(rect.width / rect.height).toBeCloseTo(ratio, 2);
      await expect
        .poll(async () => {
          const thumbnail = await shotButton(page)
            .locator(".scene-shot-thumbnail")
            .boundingBox();
          return thumbnail.width / thumbnail.height;
        })
        .toBeCloseTo(ratio, 2);
      await expect(
        panel.getByAltText("Прикреплённый пример кадра"),
      ).toHaveAttribute("src", original);
    }
    await selectAppOption(
      page,
      panel.getByRole("combobox", { name: "Формат кадра", exact: true }),
      "2.39",
    );
    await panel.getByRole("button", { name: /Диалог Мы увидимся/ }).click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            getSelection()?.anchorNode?.parentElement?.closest(
              ".screenplay-block",
            )?.dataset.blockId,
        ),
      )
      .toBe("dialogue");
    await panel
      .locator(".shot-info-scroll")
      .evaluate((node) => node.scrollTo(0, 0));
    await page.screenshot({ path: info.outputPath("shot-drawer.png") });
    await page
      .getByRole("combobox", { name: "Вариант сцены 1", exact: true })
      .click();
    await page.getByRole("option", { name: "F", exact: true }).click();
    await expect(shotButton(page).locator("img")).toHaveCount(0);
    await expect(shotButton(page).locator("svg")).toHaveCount(1);
    for (const name of ["Дата съёмок", "Локация съёмок"])
      await expect(
        panel.getByRole("button", { name, exact: true }),
      ).toHaveAttribute("aria-expanded", "false");
    await expect(
      panel.getByRole("button", { name: "Название шота", exact: true }),
    ).toHaveAttribute("aria-expanded", "false");
    await expect(
      panel.getByRole("button", { name: "Формат кадра", exact: true }),
    ).toHaveAttribute("aria-expanded", "false");
    await expect(
      panel.getByRole("combobox", { name: "Время суток", exact: true }),
    ).toContainText("СУМЕРКИ · из заголовка");
    await panel
      .getByRole("button", { name: "Название шота", exact: true })
      .click();
    await panel
      .getByRole("textbox", { name: "Название шота" })
      .fill("Вечерняя встреча");
    await expect
      .poll(async () => (await stored(page))?.sceneShots?.scene?.F?.name)
      .toBe("Вечерняя встреча");
    await page.reload();
    await shotButton(page).click();
    await expect(
      drawer(page).getByRole("textbox", { name: "Название шота" }),
    ).toHaveValue("Вечерняя встреча");
    await page
      .getByRole("combobox", { name: "Вариант сцены 1", exact: true })
      .click();
    await page.getByRole("option", { name: "A", exact: true }).click();
    await expect(
      drawer(page).getByRole("textbox", { name: "Название шота" }),
    ).toHaveValue("Встреча у окна");
    await expect(
      drawer(page).getByLabel("Дата съёмок", { exact: true }),
    ).toHaveValue("2026-10-21");
    await expect(
      drawer(page).getByLabel("Название локации", { exact: true }),
    ).toHaveValue("Кафе у вокзала");
    await expect(
      drawer(page).getByLabel("Широта", { exact: true }),
    ).toHaveValue("55.751244");
    await expect(
      drawer(page).getByRole("button", { name: "Формат кадра", exact: true }),
    ).toHaveAttribute("aria-expanded", "true");
    await expect(
      drawer(page).getByAltText("Прикреплённый пример кадра"),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Закрыть информацию о кадре", exact: true })
      .click();
    await page.mouse.move(100, 800);
    await expect(shotButton(page)).toHaveCSS("opacity", "1");
    await expect(shotButton(page).locator("img")).toHaveAttribute(
      "src",
      original,
    );
    await shotButton(page).screenshot({
      path: info.outputPath("shot-thumbnail.png"),
    });
    await shotButton(page).click();
    await expect(
      drawer(page).getByRole("textbox", { name: "Название шота" }),
    ).toHaveValue("Встреча у окна");
    await drawer(page)
      .locator('input[type="file"]')
      .setInputFiles({
        name: "replacement-shot.png",
        mimeType: "image/png",
        buffer: await uploadedImage(page, true),
      });
    await expect(
      drawer(page).getByAltText("Прикреплённый пример кадра"),
    ).not.toHaveAttribute("src", original);
    const replacement = await drawer(page)
      .getByAltText("Прикреплённый пример кадра")
      .getAttribute("src");
    await expect(shotButton(page).locator("img")).toHaveAttribute(
      "src",
      replacement,
    );
    await drawer(page)
      .getByRole("button", { name: "Удалить пример кадра", exact: true })
      .click();
    await expect(shotButton(page).locator("img")).toHaveCount(0);
    await expect(shotButton(page).locator("svg")).toHaveCount(1);
  });

test("320px: shot settings use the mobile sheet and block navigation returns to the text", async ({
  page,
}, info) => {
  await open(page, { width: 320, theme: "dark" });
  expect((await shotButton(page).boundingBox()).width).toBe(48);
  expect((await shotButton(page).boundingBox()).height).toBe(48);
  await shotButton(page).click();
  await expect(
    page.getByRole("dialog", { name: "Панель сценария", exact: true }),
  ).toBeVisible();
  const rect = await drawer(page).boundingBox();
  expect(rect.x).toBeGreaterThanOrEqual(0);
  expect(rect.x + rect.width).toBeLessThanOrEqual(320);
  await drawer(page)
    .getByRole("button", { name: "Локация съёмок", exact: true })
    .click();
  const map = drawer(page).getByRole("region", {
    name: "Карта локации съёмок",
  });
  await expect(map.locator(".leaflet-tile-pane")).toBeAttached();
  const mapRect = await map.boundingBox();
  expect(mapRect.x).toBeGreaterThanOrEqual(0);
  expect(mapRect.x + mapRect.width).toBeLessThanOrEqual(320);
  await map.focus();
  await page.keyboard.press("Enter");
  await expect(drawer(page).locator(".shot-location-value")).toBeVisible();
  await drawer(page).getByLabel("Широта", { exact: true }).fill("0");
  await drawer(page).getByLabel("Долгота", { exact: true }).fill("0");
  await drawer(page)
    .getByRole("button", { name: "Применить координаты", exact: true })
    .click();
  await expect(drawer(page).locator(".shot-location-value")).toContainText(
    "0.000000, 0.000000",
  );
  await drawer(page)
    .getByRole("button", { name: "Локация съёмок", exact: true })
    .click();
  await drawer(page)
    .getByRole("button", { name: "Людей в кадре", exact: true })
    .click();
  await selectAppOption(
    page,
    drawer(page).getByRole("combobox", { name: "Людей в кадре", exact: true }),
    "2",
  );
  await drawer(page)
    .locator('input[type="file"]')
    .setInputFiles({
      name: "mobile-shot.png",
      mimeType: "image/png",
      buffer: await uploadedImage(page),
    });
  await expect(
    drawer(page).getByAltText("Прикреплённый пример кадра"),
  ).toBeVisible();
  const original = await drawer(page)
    .getByAltText("Прикреплённый пример кадра")
    .getAttribute("src");
  await page.screenshot({ path: info.outputPath("mobile-shot-sheet.png") });
  await drawer(page)
    .getByRole("button", { name: /Диалог Мы увидимся/ })
    .click();
  await expect(drawer(page)).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          getSelection()?.anchorNode?.parentElement?.closest(
            ".screenplay-block",
          )?.dataset.blockId,
      ),
    )
    .toBe("dialogue");
  await expect(shotButton(page).locator("img")).toBeVisible();
  await expect(shotButton(page).locator("img")).toHaveAttribute(
    "src",
    original,
  );
  expect((await shotButton(page).boundingBox()).width).toBe(48);
  await shotButton(page).screenshot({
    path: info.outputPath("mobile-shot-thumbnail.png"),
  });
  await shotButton(page).click();
  await expect(
    drawer(page).getByAltText("Прикреплённый пример кадра"),
  ).toHaveAttribute("src", original);
});

test("adjacent empty scenes keep the square shot controls separated", async ({
  page,
}) => {
  const doc = fixture();
  doc.content.content = [1, 2, 3].map((n) => p("scene", "", `scene-${n}`, "A"));
  await open(page, { doc });
  const controls = page.locator(".scene-shot-button");
  await expect(controls).toHaveCount(3);
  const geometry = () =>
    controls.evaluateAll((nodes) =>
      nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          y: rect.y,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        };
      }),
    );
  await expect
    .poll(async () => {
      const buttons = await geometry();
      return Math.min(
        buttons[1].y - buttons[0].bottom,
        buttons[2].y - buttons[1].bottom,
      );
    })
    .toBeGreaterThanOrEqual(4);
  for (const rect of await geometry()) {
    expect(rect.width).toBe(48);
    expect(rect.height).toBe(48);
  }
  const first = page.locator('.screenplay-block[data-format="scene"]').first();
  const normalGap = () =>
    page
      .locator('.screenplay-block[data-format="scene"]')
      .last()
      .evaluate((node) => getComputedStyle(node).marginBottom);
  await page
    .locator(".minimal-app")
    .evaluate((node) => node.classList.add("focus-mode"));
  await expect(controls.first()).toBeHidden();
  await expect(first).toHaveCSS("margin-bottom", await normalGap());
  await page
    .locator(".minimal-app")
    .evaluate((node) => node.classList.remove("focus-mode"));
  await page.emulateMedia({ media: "print" });
  await expect(controls.first()).toBeHidden();
  await expect(first).toHaveCSS("margin-bottom", await normalGap());
});

test("scene autocomplete offers dusk, dawn, sunrise, sunset and other screenplay times", async ({
  page,
}) => {
  const doc = fixture();
  doc.content.content = [p("scene", "ИНТ. ДОМ — ", "scene")];
  await open(page, { doc });
  await page.locator('[data-block-id="scene"]').click();
  await page.keyboard.press("End");
  const popup = page.getByRole("listbox", { name: "Подсказки", exact: true });
  await expect(popup).toBeVisible();
  for (const [, ru] of SCENE_TIMES)
    await expect(
      popup.getByRole("option", { name: new RegExp(`^${ru}(?:\\s|$)`) }),
    ).toBeAttached();
  await page.keyboard.insertText("СУМ");
  await expect(
    popup.getByRole("option", { name: /^СУМЕРКИ(?:\s|$)/ }),
  ).toBeVisible();
  await page.keyboard.press("Control+Enter");
  await expect(page.locator('[data-block-id="scene"]')).toContainText(
    "СУМЕРКИ",
  );
});

test("PDF shot report includes every scene and stored variant, all settings and the complete text", async ({
  page,
}, info) => {
  let doc = updateShotSettings(fixture(), "scene", "A", {
    name: "Встреча у окна",
    aspectRatio: "2.39",
    people: "2",
    lighting: "back",
    shootingDate: "2026-10-21",
    location: {
      name: "Кафе у вокзала",
      latitude: 55.751244,
      longitude: 37.618423,
    },
  });
  doc = updateShotSettings(doc, "scene", "F", {
    name: "Вечерняя встреча",
    frameSize: "close",
  });
  await open(page, { doc });
  await shotButton(page).click();
  await drawer(page)
    .locator('input[type="file"]')
    .setInputFiles({
      name: "my-shot.png",
      mimeType: "image/png",
      buffer: await uploadedImage(page),
    });
  await expect(
    drawer(page).getByAltText("Прикреплённый пример кадра"),
  ).toBeVisible();
  const pending = page.waitForEvent("download");
  await drawer(page)
    .getByRole("button", { name: "PDF-отчёт по всем сценам" })
    .click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  const path = info.outputPath("shot-report.pdf");
  await download.saveAs(path);
  const fs = await import("node:fs/promises");
  const bytes = Array.from(await fs.readFile(path));
  const result = await page.evaluate(async (bytes) => {
    const pdfjs = await import("/node_modules/pdfjs-dist/build/pdf.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc =
      "/node_modules/pdfjs-dist/build/pdf.worker.mjs";
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes) })
      .promise;
    let text = "";
    const images = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      text += (await page.getTextContent()).items
        .map((item) => item.str)
        .join(" ");
      const operators = await page.getOperatorList();
      operators.fnArray.forEach((op, index) => {
        if (op === pdfjs.OPS.paintImageXObject)
          images.push(operators.argsArray[index].slice(1));
      });
    }
    return { text: text.replace(/\s+/g, " "), pages: pdf.numPages, images };
  }, bytes);
  for (const text of [
    "Вариант A",
    "Вариант F",
    "Встреча у окна",
    "Вечерняя встреча",
    "2.39",
    "Контровой",
    "НОЧЬ",
    "СУМЕРКИ",
    "Заголовок",
    "Персонаж",
    "Диалог",
    "Переход",
    "Заметки",
    "Дата съёмок: 2026-10-21",
    "Локация съёмок: Кафе у вокзала",
    "55.751244, 37.618423",
    "Мы увидимся на рассвете.",
  ])
    expect(result.text).toContain(text);
  expect(result.text).not.toMatch(/ShotDeck|shotdeck\.com/);
  expect(result.images).toHaveLength(1);
  expect(result.images[0][0] / result.images[0][1]).toBeCloseTo(2.39, 2);
  expect(result.pages).toBeGreaterThan(2);
});

test("cropping preserves the source and keeps the centre for square, portrait and wide formats", async ({
  page,
}) => {
  await open(page);
  const buffer = await uploadedImage(page);
  const source = `data:image/png;base64,${buffer.toString("base64")}`;
  const results = await page.evaluate(async (source) => {
    const { croppedShotImage } = await import("/src/shot-image.js");
    const samples = [];
    for (const format of ["1:1", "9:16", "2.39", ""]) {
      const result = await croppedShotImage(source, format);
      const bitmap = await createImageBitmap(
        await (await fetch(result)).blob(),
      );
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(bitmap, 0, 0);
      samples.push({
        format,
        width: bitmap.width,
        height: bitmap.height,
        left: [
          ...ctx.getImageData(4, Math.floor(bitmap.height / 2), 1, 1).data,
        ],
        unchanged: result === source,
      });
      bitmap.close();
    }
    return samples;
  }, source);
  expect(results[0].width).toBe(results[0].height);
  expect(results[1].width / results[1].height).toBeCloseTo(9 / 16, 2);
  expect(results[2].width / results[2].height).toBeCloseTo(2.39, 2);
  for (const sample of results.slice(0, 2))
    expect(sample.left[1]).toBeGreaterThan(sample.left[2] * 2);
  expect(results[3].unchanged).toBe(true);
  expect(results[3].left[2]).toBeGreaterThan(results[3].left[1] * 2);
});

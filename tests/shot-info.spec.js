import { test, expect } from "@playwright/test";
import { createProject, validateImport } from "../src/data.js";
import { switchSceneVariant } from "../src/scene-variants.js";
import { switchScriptVersion } from "../src/script-versions.js";
import {
  shotScenes,
  shotReportName,
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
test("shot names follow scene order and variants without changing the stored base names", () => {
  let doc = updateShotSettings(fixture(), "scene", "A", {
    name: "Встреча у окна",
  });
  doc = updateShotSettings(doc, "scene", "F", { name: "Вечерняя встреча" });
  expect(shotScenes(doc, { allVariants: true }).map(shotReportName)).toEqual([
    "1-A: Встреча у окна",
    "1-F: Вечерняя встреча",
    "2-A: untitled 1",
  ]);
  const before = JSON.stringify(doc.sceneShots);
  doc = {
    ...doc,
    content: {
      ...doc.content,
      content: [
        ...doc.content.content.slice(7),
        ...doc.content.content.slice(0, 7),
      ],
    },
  };
  expect(shotScenes(doc, { allVariants: true }).map(shotReportName)).toEqual([
    "1-A: untitled 1",
    "2-A: Встреча у окна",
    "2-F: Вечерняя встреча",
  ]);
  expect(JSON.stringify(doc.sceneShots)).toBe(before);
  const hundred = createProject("100 сцен");
  hundred.content.content = Array.from({ length: 100 }, (_, index) =>
    p("scene", "ИНТ. ДОМ — ДЕНЬ", `scene-${index}`, index === 99 ? "F" : "A"),
  );
  const last = shotScenes(
    updateShotSettings(hundred, "scene-99", "F", { name: "untitled 1" }),
  ).at(-1);
  expect(shotReportName(last)).toBe("100-F: untitled 1");
  expect(shotReportName({ ...last, settings: { name: "  " } })).toBe(
    "100-F: untitled 1",
  );
});
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
  expect(clean.scriptVersions?.blue).toBeUndefined();
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
  await page
    .locator(".story-inspector")
    .getByRole("tab", { name: "Инфо", exact: true })
    .click();
  await page
    .locator(".story-inspector")
    .locator('input[type="file"]')
    .setInputFiles({
      name: "my-shot.png",
      mimeType: "image/png",
      buffer: await uploadedImage(page),
    });
  await expect(
    page.locator(".story-inspector").getByAltText("Выбранный слайд"),
  ).toBeVisible();
  await page
    .locator(".story-inspector")
    .getByRole("tab", { name: "DETAILS", exact: true })
    .click();
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
  for (const filename of ["pdf.mjs", "pdf.worker.mjs"])
    await page.route(
      `**/node_modules/pdfjs-dist/build/${filename}`,
      async (route) =>
        route.fulfill({
          contentType: "text/javascript",
          body: await fs.readFile(
            new URL(
              `../node_modules/pdfjs-dist/build/${filename}`,
              import.meta.url,
            ),
          ),
        }),
    );
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
    "Название шота: 1-A: Встреча у окна",
    "Название шота: 1-F: Вечерняя встреча",
    "Название шота: 2-A: untitled 1",
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

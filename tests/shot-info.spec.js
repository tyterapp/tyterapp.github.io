import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { createProject, validateImport } from "../src/data.js";
import { switchSceneVariant } from "../src/scene-variants.js";
import { switchScriptVersion } from "../src/script-versions.js";
import {
  shotScenes,
  updateShotSettings,
  sceneDuration,
  SHOT_FIELDS,
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

test("shot settings survive import, remain isolated by variant and script version, and duration uses full screenplay pages", () => {
  let doc = updateShotSettings(fixture(), "scene", "A", {
    name: "Встреча у окна",
    aspectRatio: "2.39",
    people: "2",
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
});

for (const theme of ["light", "dark"])
  test(`${theme}: shot drawer saves per-variant settings, keeps the screenplay view and links to blocks`, async ({
    page,
  }, info) => {
    await open(page, { theme });
    await page.mouse.move(100, 800);
    await expect(shotButton(page)).toHaveCSS("opacity", "0.2");
    await shotButton(page).hover();
    await expect(shotButton(page)).toHaveCSS("opacity", "1");
    await shotButton(page).click();
    const panel = drawer(page);
    await expect(panel).toBeVisible();
    await expect.poll(() => panel.locator(".shot-reference img").evaluate(image => image.naturalWidth)).toBeGreaterThan(0);
    await expect(page.locator(".screenplay-editor")).toBeVisible();
    await expect(
      panel.getByRole("combobox", { name: "Время суток", exact: true }),
    ).toContainText("ДЕНЬ · из заголовка");
    await expect(panel.getByRole("combobox")).toHaveCount(
      SHOT_FIELDS.length + 1,
    );
    await panel
      .getByRole("textbox", { name: "Название шота", exact: true })
      .fill("Встреча у окна");
    await selectAppOption(
      page,
      panel.getByRole("combobox", { name: "Соотношение сторон", exact: true }),
      "2.39",
    );
    await panel.locator('input[type="file"]').setInputFiles(fileURLToPath(new URL("../public/shot-references/odyssey.jpg", import.meta.url)));
    await expect(panel.getByAltText("Прикреплённый пример кадра")).toBeVisible();
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
    await expect(
      panel.getByRole("textbox", { name: "Название шота" }),
    ).toHaveValue("");
    await expect(
      panel.getByRole("combobox", { name: "Время суток", exact: true }),
    ).toContainText("СУМЕРКИ · из заголовка");
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
    await expect(drawer(page).getByAltText("Прикреплённый пример кадра")).toBeVisible();
    await page
      .getByRole("button", { name: "Закрыть информацию о кадре", exact: true })
      .click();
    await page.mouse.move(100, 800);
    await expect(shotButton(page)).toHaveCSS("opacity", "1");
  });

test("320px: shot settings use the mobile sheet and block navigation returns to the text", async ({
  page,
}, info) => {
  await open(page, { width: 320, theme: "dark" });
  expect((await shotButton(page).boundingBox()).width).toBe(44);
  await shotButton(page).click();
  await expect(
    page.getByRole("dialog", { name: "Панель сценария", exact: true }),
  ).toBeVisible();
  const rect = await drawer(page).boundingBox();
  expect(rect.x).toBeGreaterThanOrEqual(0);
  expect(rect.x + rect.width).toBeLessThanOrEqual(320);
  await selectAppOption(
    page,
    drawer(page).getByRole("combobox", { name: "Людей в кадре", exact: true }),
    "2",
  );
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
  });
  doc = updateShotSettings(doc, "scene", "F", {
    name: "Вечерняя встреча",
    frameSize: "close",
  });
  await open(page, { doc });
  await shotButton(page).click();
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
    for (let i = 1; i <= pdf.numPages; i++)
      text += (await (await pdf.getPage(i)).getTextContent()).items
        .map((item) => item.str)
        .join(" ");
    return { text: text.replace(/\s+/g, " "), pages: pdf.numPages };
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
    "shotdeck.com",
    "Мы увидимся на рассвете.",
  ])
    expect(result.text).toContain(text);
  expect(result.pages).toBeGreaterThan(2);
});

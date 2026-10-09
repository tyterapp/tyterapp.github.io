import { test, expect } from "@playwright/test";
import { createProject, validateImport } from "../src/data.js";
import { documentSearchMatches } from "../src/document-search.js";
import {
  libraryFromDocument,
  mergeComponentLibrary,
} from "../src/component-library.js";
import { grantPro } from "./helpers/pro-access.js";
import { readFile, writeFile } from "node:fs/promises";

const p = (format, text, blockId, sceneVariant) => ({
  type: "paragraph",
  attrs: { format, blockId, ...(sceneVariant ? { sceneVariant } : {}) },
  ...(text ? { content: [{ type: "text", text }] } : {}),
});
function fixture() {
  const doc = createProject("Библиотеки и варианты");
  doc.id = "library-variant-test";
  doc.content.content = [
    p("scene", "ИНТ. МАЯК — ДЕНЬ", "scene", "A"),
    p("action", "Анна открывает дверь.", "action"),
    p("character", "АННА", "anna"),
    p("speech", "Реплика Анны.", "anna-speech"),
    p("character", "БОРИС", "boris"),
    p("speech", "Реплика Бориса.", "boris-speech"),
  ];
  doc.sceneVariants = {
    scene: {
      A: [p("scene", "УСТАРЕВШИЙ МАЯК", "scene", "A")],
      B: [
        p("scene", "ИНТ. БАШНЯ — ДЕНЬ", "scene", "B"),
        p("action", "Маяк виден из окна.", "b-action"),
      ],
      F: [
        p("scene", "ЭКС. МАЯК — НОЧЬ", "scene", "F"),
        p("action", "Маяк погас.", "f-action"),
        p("character", "СМОТРИТЕЛЬ МАЯКА", "f-character"),
        p("speech", "Скрытая реплика.", "f-speech"),
      ],
    },
  };
  return doc;
}
async function open(page, doc = fixture()) {
  await grantPro(page);
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  await page.addInitScript((doc) => {
    localStorage.setItem("tyter.onboarding.v1", "done");
    if (!sessionStorage.getItem("library-variant-seeded")) {
      localStorage.setItem("tyter.projects.v1", JSON.stringify([doc]));
      localStorage.setItem("tyter.active", doc.id);
      localStorage.setItem("tyter.language.v1", "ru");
      sessionStorage.setItem("library-variant-seeded", "yes");
    }
  }, doc);
  await page.goto("/pro");
  await expect(page.locator(".screenplay-editor")).toBeFocused();
}
const stored = (page) =>
  page.evaluate(async () => {
    const { browserRequest } = await import("/src/browser-files.js");
    return (await browserRequest("documents")).documents.find(
      (d) => d.id === "library-variant-test",
    );
  });
const openLibrary = async (page) => {
  await page.getByRole("button", { name: "Компоненты", exact: true }).click();
  await page
    .getByRole("button", { name: "Библиотеки компонентов", exact: true })
    .click();
  return page.getByRole("dialog", {
    name: "Библиотеки компонентов",
    exact: true,
  });
};
test("search uses live active text and cached alternatives in stable A–F order", () => {
  const doc = fixture();
  const matches = documentSearchMatches(doc, "маяк");
  expect(matches.map((m) => m.variant)).toEqual(["A", "B", "F", "F", "F"]);
  expect(matches.map((m) => m.text).join(" ")).not.toContain("УСТАРЕВШИЙ");
  expect(
    documentSearchMatches(doc, "маяк", "action").map((m) => m.blockId),
  ).toEqual(["b-action", "f-action"]);
});
test("search reveals inactive variants, highlights selected results and navigates across versions", async ({
  page,
}) => {
  await open(page);
  await page.keyboard.press("Control+f");
  await page.getByLabel("Поиск по тексту", { exact: true }).fill("маяк");
  const cards = page.locator(".search-result-card");
  await expect(cards).toHaveCount(5);
  await expect(cards.last()).toContainText("Вариант F");
  await cards.last().click();
  await expect(page.locator('p[data-block-id="scene"]')).toHaveAttribute(
    "data-scene-variant",
    "F",
  );
  await expect(
    page.locator('p[data-block-id="f-character"] .search-from-card'),
  ).toContainText("МАЯК");
  await expect(cards).toHaveCount(5);
  await page.getByRole("button", { name: "Следующее совпадение" }).click();
  await expect(page.locator('p[data-block-id="scene"]')).toHaveAttribute(
    "data-scene-variant",
    "A",
  );
  await expect(page.locator(".search-count")).toHaveText("1 / 5");
  await page
    .getByRole("combobox", { name: "Формат текста", exact: true })
    .selectOption("action");
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toContainText("Вариант B");
  await cards.last().click();
  await expect(
    page.locator('p[data-block-id="f-action"] .search-from-card'),
  ).toHaveText("Маяк");
  await page.getByLabel("Поиск по тексту", { exact: true }).fill("Анна");
  await expect(cards).toHaveCount(1);
  await expect(page.locator('p[data-block-id="action"]')).toBeVisible();
});
test("statistics collapses characters and opens dialogue reading with a character switcher", async ({
  page,
}, info) => {
  await open(page);
  await page
    .getByRole("button", { name: "Статистика документа", exact: true })
    .click();
  const stats = page.getByRole("complementary", {
    name: "Статистика документа",
  });
  const toggle = stats.getByRole("button", { name: "Персонажи и диалоги" });
  await toggle.click();
  await expect(stats.locator(".statistics-characters")).not.toBeVisible();
  await toggle.click();
  await stats
    .locator(".statistics-character-button")
    .filter({ hasText: "АННА" })
    .click();
  const reading = page.getByRole("main", { name: "Реплики персонажа" });
  await expect(reading.locator("article")).toHaveCount(1);
  await expect(reading.locator("article")).toContainText("Реплика Анны.");
  const nav = reading.getByRole("navigation", { name: "Персонажи сценария" });
  await nav.getByRole("button", { name: /БОРИС/ }).click();
  await expect(reading.locator("article")).toContainText("Реплика Бориса.");
  await expect(reading.locator("article")).not.toContainText("Реплика Анны.");
  await nav.getByRole("button", { name: /Все персонажи/ }).click();
  await expect(reading.locator("article")).toHaveCount(2);
  await expect(reading.locator("article h3")).toHaveText(["АННА", "БОРИС"]);
  await page.screenshot({ path: info.outputPath("character-switcher.png") });
  await reading.getByRole("button", { name: "Вернуться к сценарию" }).click();
  await expect(reading).toHaveCount(0);
  await expect(page.locator(".screenplay-editor")).toBeFocused();
});
test("connected library can disable all, persist, enable individual components, export a subset and detach", async ({
  page,
}, info) => {
  const source = createProject("Внешняя библиотека");
  source.components = [
    {
      id: "source-anna",
      name: "Анна",
      type: "character",
      description: "Героиня",
    },
    {
      id: "source-boris",
      name: "Борис",
      type: "character",
      description: "Герой",
    },
  ];
  const library = libraryFromDocument(source);
  const doc = mergeComponentLibrary(
    fixture(),
    library,
    library.components.map((c) => c.id),
  ).document;
  const anna = doc.components.find((c) => c.name === "Анна");
  doc.content.content[1].content[0].marks = [
    {
      type: "entity",
      attrs: { id: anna.id, color: "#8a799a", automatic: false },
    },
  ];
  await open(page, doc);
  let modal = await openLibrary(page);
  await expect(modal.locator(".library-list")).toContainText(
    "Текущий документ",
  );
  await modal
    .locator(".library-list button")
    .filter({ hasText: "Внешняя библиотека" })
    .click();
  await modal
    .getByRole("checkbox", { name: "Включить все компоненты" })
    .uncheck();
  await modal.getByRole("button", { name: "Применить", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await stored(page)).components.filter((c) => c.enabled !== false)
          .length,
    )
    .toBe(0);
  await expect(page.locator(".component-library-link")).toHaveCount(0);
  await expect(page.locator(".script-entity-disabled")).toBeVisible();
  const preserved = (await stored(page)).content.content[1].content
    .flatMap((n) => n.marks || [])
    .filter((m) => m.type === "entity");
  expect(
    preserved.some((m) => m.attrs.id === anna.id && !m.attrs.automatic),
  ).toBe(true);
  await page.reload();
  modal = await openLibrary(page);
  await modal
    .locator(".library-list button")
    .filter({ hasText: "Внешняя библиотека" })
    .click();
  await expect(
    modal.getByRole("checkbox", { name: "Включить все компоненты" }),
  ).not.toBeChecked();
  await modal.getByRole("checkbox", { name: "Анна Героиня" }).check();
  await modal.getByRole("button", { name: "Применить", exact: true }).click();
  await expect
    .poll(async () =>
      (await stored(page)).components
        .filter((c) => c.enabled !== false)
        .map((c) => c.name),
    )
    .toEqual(["Анна"]);
  await expect(page.locator(".script-entity-disabled")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Библиотеки компонентов", exact: true })
    .click();
  await modal.getByRole("checkbox", { name: "Борис Герой" }).uncheck();
  const downloadPromise = page.waitForEvent("download");
  await modal
    .getByRole("button", { name: "Скачать библиотеку", exact: true })
    .click();
  const download = await downloadPromise;
  const path = info.outputPath("selected.tytl");
  await download.saveAs(path);
  const exported = JSON.parse(await readFile(path, "utf8"));
  expect(exported.components.map((c) => c.name)).toEqual(["Анна"]);
  expect(exported.components[0].librarySource).toBeUndefined();
  expect(
    validateImport(await stored(page)).components.find(
      (c) => c.name === "Борис",
    ).enabled,
  ).toBe(false);
  await modal
    .locator(".library-list button")
    .filter({ hasText: "Внешняя библиотека" })
    .click();
  await modal
    .getByRole("button", { name: "Отвязать библиотеку", exact: true })
    .click();
  await expect
    .poll(async () =>
      (await stored(page)).components.some((c) => c.librarySource),
    )
    .toBe(false);
  expect((await stored(page)).components.map((c) => c.id)).toEqual(
    doc.components.map((c) => c.id),
  );
  await expect(modal.locator(".library-list button").first()).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.screenshot({ path: info.outputPath("local-library.png") });
  const persisted = validateImport(await stored(page));
  expect(persisted.components.find((c) => c.name === "Борис").enabled).not.toBe(
    false,
  );
});
test("PDF cover doubles poster dimensions and keeps title and credits on the title page", async ({
  page,
}, info) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const { exportPDF } = await import("/src/exports.js");
    const { createProject } = await import("/src/data.js");
    const pdfjs = await import("/node_modules/.vite/deps/pdfjs-dist.js");
    pdfjs.GlobalWorkerOptions.workerSrc =
      "/node_modules/pdfjs-dist/build/pdf.worker.min.mjs";
    const canvas = document.createElement("canvas");
    canvas.width = 300;
    canvas.height = 400;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#655185";
    ctx.fillRect(0, 0, 300, 400);
    const doc = createProject("Название сценария");
    doc.metadata = {
      ...doc.metadata,
      poster: canvas.toDataURL("image/png"),
      author: "Автор",
      email: "author@example.com",
      year: "2026",
    };
    const blob = await exportPDF(doc);
    const task = pdfjs.getDocument({
      data: new Uint8Array(await blob.arrayBuffer()),
      isEvalSupported: false,
    });
    const pdf = await task.promise,
      cover = await pdf.getPage(1),
      viewport = cover.getViewport({ scale: 1 });
    const ops = await cover.getOperatorList(),
      sizes = [];
    for (let i = 0; i < ops.fnArray.length; i++)
      if (ops.fnArray[i] === pdfjs.OPS.paintImageXObject) {
        for (let j = i - 1; j >= 0; j--)
          if (ops.fnArray[j] === pdfjs.OPS.transform) {
            sizes.push([
              Math.abs(ops.argsArray[j][0]),
              Math.abs(ops.argsArray[j][3]),
            ]);
            break;
          }
      }
    const text = (await cover.getTextContent()).items
      .filter((i) => i.str)
      .map((i) => ({ text: i.str, y: viewport.height - i.transform[5] }));
    const output = document.createElement("canvas");
    output.width = viewport.width;
    output.height = viewport.height;
    await cover.render({ canvasContext: output.getContext("2d"), viewport })
      .promise;
    const preview = output.toDataURL();
    const screenplayHeight = (await pdf.getPage(2)).getViewport({
      scale: 1,
    }).height;
    await task.destroy();
    return { sizes, text, preview, height: viewport.height, screenplayHeight };
  });
  expect(result.sizes).toEqual([[540, 720]]);
  expect(result.screenplayHeight).toBeCloseTo(792, 1);
  const text = result.text.map((i) => i.text).join(" ");
  for (const value of [
    "Название сценария",
    "Автор",
    "author@example.com",
    "2026",
  ])
    expect(text).toContain(value);
  expect(Math.max(...result.text.map((i) => i.y))).toBeLessThan(
    result.height - 24,
  );
  await writeFile(
    info.outputPath("pdf-title-page.png"),
    Buffer.from(result.preview.split(",")[1], "base64"),
  );
});

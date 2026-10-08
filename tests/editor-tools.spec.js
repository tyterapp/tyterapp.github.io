import { test, expect } from "@playwright/test";
import { createProject, validateImport, nodeText } from "../src/data.js";
import {
  switchSceneVariant,
  sceneVariantLetters,
} from "../src/scene-variants.js";
import { inspectScript } from "../src/script-doctor.js";
import {
  libraryFromDocument,
  mergeComponentLibrary,
  readComponentLibrary,
} from "../src/component-library.js";
import { grantPro } from "./helpers/pro-access.js";

const p = (format, text, blockId) => ({
  type: "paragraph",
  attrs: { format, blockId },
  ...(text ? { content: [{ type: "text", text }] } : {}),
});
const fixture = () => ({
  ...createProject("Новые инструменты"),
  id: "tools-document",
  content: {
    type: "doc",
    content: [
      p("scene", "ИНТ. ДОМ — ДЕНЬ", "scene-1"),
      p("action", "Анна открывает окно.", "action-1"),
      p("character", "АННА", "anna-1"),
      p("parenthetical", "(тихо)", "aside-1"),
      p("speech", "Здравствуй, утро.", "speech-1"),
      p("character", "БОРИС", "boris-1"),
      p("speech", "Привет, Анна!", "speech-2"),
      p("scene", "ЭКС. САД", "scene-2"),
      p("character", "АННА (З.К.)", "anna-2"),
      p("speech", "Я уже в саду.", "speech-3"),
      p("character", "БОРИС", "boris-2"),
    ],
  },
  components: [
    {
      id: "anna",
      name: "Анна",
      type: "character",
      description: "Главная героиня",
      thumbnail: null,
    },
  ],
  outline: {
    columns: [{ id: "act", title: "Акт 1" }],
    cards: [
      {
        id: "card",
        columnId: "act",
        blockId: "scene-1",
        title: "Дом",
        text: "Независимое описание",
        comments: [],
        drama: 2,
      },
    ],
  },
});
async function open(page, documents = [fixture()], pro = false) {
  if (pro) await grantPro(page);
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  await page.addInitScript((docs) => {
    localStorage.setItem("tyter.onboarding.v1", "done");
    if (sessionStorage.getItem("tools-seeded")) return;
    localStorage.setItem("tyter.projects.v1", JSON.stringify(docs));
    localStorage.setItem("tyter.active", docs[0].id);
    localStorage.setItem("tyter.language.v1", "ru");
    sessionStorage.setItem("tools-seeded", "yes");
  }, documents);
  await page.goto(pro ? "/pro" : "/free");
  await expect(page.locator(".screenplay-editor")).toBeFocused();
  await page.evaluate(() => document.fonts.ready);
}
const scene = (page, id) =>
  page.locator(`.screenplay-block[data-block-id="${id}"]`);
const libraryDialog = (page) =>
  page.getByRole("dialog", { name: "Библиотеки компонентов", exact: true });

test("libraries in an authorized folder are offered for embedding without reading other folders", async ({
  page,
}) => {
  await open(page, [fixture()], true);
  const library = libraryFromDocument(fixture()),
    target = createProject("Сценарий из папки");
  await page.evaluate(
    async ({ library, payload }) => {
      const directory = await navigator.storage.getDirectory();
      for (const [name, data] of [
        ["my-library.tytl", library],
        ["screenplay.tyt", payload],
      ]) {
        const file = await directory.getFileHandle(name, { create: true }),
          stream = await file.createWritable();
        await stream.write(JSON.stringify(data));
        await stream.close();
      }
      window.showDirectoryPicker = async () => directory;
    },
    {
      library,
      payload: { format: "tyter", version: 1, document: target, history: [] },
    },
  );
  await page.getByRole("button", { name: "Открыть папку сценариев" }).click();
  await expect(libraryDialog(page)).toContainText(
    "В выбранной папке найдены библиотеки",
  );
  await libraryDialog(page)
    .getByRole("button", { name: "Внедрить в сценарий" })
    .click();
  await expect(libraryDialog(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Компоненты", exact: true }).click();
  await expect(page.locator(".component-library-link")).toHaveCount(1);
});

test("new settings and tools are translated and dark theme covers the outline and sidebars", async ({
  page,
}, info) => {
  await open(page, [fixture()], true);
  await page
    .getByRole("button", { name: "Настройки документа", exact: true })
    .click();
  await page.getByLabel("Тема интерфейса").selectOption("dark");
  await page.getByRole("button", { name: "ENG", exact: true }).click();
  await expect(page.getByLabel("Typewriter sound")).not.toBeChecked();
  await expect(page.getByLabel("Interface theme")).toHaveValue("dark");
  await page.screenshot({ path: info.outputPath("dark-settings.png") });
  await page.keyboard.press("Escape");
  await expect(
    scene(page, "scene-1").getByLabel("Scene 1 variant"),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Script doctor", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /Missing time of day/ }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("dark-doctor.png") });
  await page.getByRole("button", { name: "Outline", exact: true }).click();
  await expect(page.locator(".outline-column")).toHaveCSS(
    "background-color",
    "rgb(36, 33, 43)",
  );
  await page.locator(".outline-card").click();
  const contrast = await page
    .locator(".outline-card-title")
    .evaluate((element) => {
      const canvas = document.createElement("canvas"),
        ctx = canvas.getContext("2d");
      const luminance = (color) => {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 1, 1);
        const rgba = ctx.getImageData(0, 0, 1, 1).data;
        return [...rgba]
          .slice(0, 3)
          .map((channel) => channel / 255)
          .map((channel) =>
            channel <= 0.04045
              ? channel / 12.92
              : ((channel + 0.055) / 1.055) ** 2.4,
          )
          .reduce(
            (sum, channel, index) =>
              sum + channel * [0.2126, 0.7152, 0.0722][index],
            0,
          );
      };
      const text = luminance(getComputedStyle(element).color),
        background = luminance(
          getComputedStyle(element.closest(".outline-card")).backgroundColor,
        );
      return (
        (Math.max(text, background) + 0.05) /
        (Math.min(text, background) + 0.05)
      );
    });
  expect(contrast).toBeGreaterThan(4.5);
  await page.screenshot({ path: info.outputPath("dark-outline.png") });
  await page
    .getByRole("button", { name: "Dramatic intensity chart", exact: true })
    .click();
  await page.screenshot({ path: info.outputPath("dark-chart.png") });
});

test("six scene versions retain independent text, links and inactive annotations through TYT validation", () => {
  const doc = fixture();
  doc.comments = [
    {
      id: "comment",
      blockId: "action-1",
      text: "Комментарий",
      quote: "Анна",
      resolved: false,
    },
  ];
  let next = switchSceneVariant(doc, "scene-1", "B");
  const bodyId = next.content.content[1].attrs.blockId;
  expect(bodyId).not.toBe("action-1");
  next.content.content[1].content[0].text = "Версия B";
  next = switchSceneVariant(next, "scene-1", "A");
  expect(nodeText(next.content.content[1])).toBe("Анна открывает окно.");
  next = validateImport(next);
  expect(next.comments).toHaveLength(1);
  next = switchSceneVariant(next, "scene-1", "B");
  expect(nodeText(next.content.content[1])).toBe("Версия B");
  expect(next.content.content[1].attrs.blockId).toBe(bodyId);
  expect(next.content.content[0].attrs.blockId).toBe("scene-1");
  expect(next.outline.cards[0].blockId).toBe("scene-1");
  expect(sceneVariantLetters(next, "scene-1", "B")).toEqual(["A", "B"]);
  expect(switchSceneVariant(next, "scene-1", "Z")).toBe(next);
});

test("library refresh updates linked definitions without overwriting same-name local components", () => {
  const library = libraryFromDocument(fixture());
  const target = createProject("Другой сценарий");
  const first = mergeComponentLibrary(target, library, ["anna"]);
  expect(first.added).toBe(1);
  const linkedId = first.document.components[0].id;
  library.components[0].description = "Новое описание";
  const refreshed = mergeComponentLibrary(first.document, library, ["anna"]);
  expect(refreshed.updated).toBe(1);
  expect(refreshed.document.components[0].id).toBe(linkedId);
  expect(
    validateImport(refreshed.document).components[0].librarySource.libraryId,
  ).toBe(library.id);
  const collision = mergeComponentLibrary(
    { ...target, components: fixture().components },
    library,
    ["anna"],
  );
  expect(collision.skipped).toBe(1);
  expect(collision.document.components[0].description).toBe("Главная героиня");
  expect(() => readComponentLibrary("broken")).toThrow();
});

test("doctor finds missing time, full duplicates and broken dialogue while repeated locations are valid", () => {
  const blocks = fixture().content.content;
  const findings = inspectScript({
    content: [
      ...blocks,
      ...blocks.slice(0, 7).map((b) => ({
        ...b,
        attrs: { ...b.attrs, blockId: b.attrs.blockId + "copy" },
      })),
    ],
  });
  expect(
    findings.some(
      (f) => f.title === "Не указано время суток" && f.blockId === "scene-2",
    ),
  ).toBe(true);
  expect(
    findings.some(
      (f) => f.title === "Персонаж без реплики" && f.blockId === "boris-2",
    ),
  ).toBe(true);
  expect(findings.some((f) => f.title === "Возможный дубликат сцены")).toBe(
    true,
  );
  const valid = inspectScript({
    content: [
      p("scene", "INT. HOUSE — DAY", "s1"),
      p("action", "One action", "a1"),
      p("scene", "INT. HOUSE — DAY", "s2"),
      p("action", "Another action", "a2"),
    ],
  });
  expect(valid).toEqual([]);
});

test("settings persist dark theme and default silent typewriter, sound only runs for screenplay typing", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const Native = window.AudioContext;
    window.audioStarts = 0;
    window.AudioContext = class extends Native {
      createBufferSource() {
        const source = super.createBufferSource(),
          start = source.start.bind(source);
        source.start = (...args) => {
          window.audioStarts++;
          return start(...args);
        };
        return source;
      }
    };
  });
  await open(page);
  await scene(page, "action-1").click();
  await page.keyboard.type(" x");
  expect(await page.evaluate(() => window.audioStarts)).toBe(0);
  await page
    .getByRole("button", { name: "Настройки документа", exact: true })
    .click();
  const sound = page.getByLabel("Звук печатной машинки");
  await expect(sound).not.toBeChecked();
  await sound.check();
  await page.getByLabel("Тема интерфейса").selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".script-paper")).toHaveCSS(
    "background-color",
    "rgb(43, 39, 50)",
  );
  await page.keyboard.press("Escape");
  await scene(page, "action-1").click();
  await page.keyboard.type(" y");
  await expect
    .poll(() => page.evaluate(() => window.audioStarts))
    .toBeGreaterThan(0);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page
    .getByRole("button", { name: "Настройки документа", exact: true })
    .click();
  await expect(sound).toBeChecked();
  await sound.uncheck();
  await page.getByLabel("Тема интерфейса").selectOption("light");
  await expect(page.locator(".script-paper")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
});

test("scene versions can be edited, searched and reloaded; number, selector and card do not overlap", async ({
  page,
}, info) => {
  await open(page, [fixture()], true);
  const variant = scene(page, "scene-1").getByLabel("Вариант сцены 1", {
    exact: true,
  });
  await variant.selectOption("B");
  await expect(variant).toHaveValue("B");
  await expect(scene(page, "scene-1")).toHaveAttribute(
    "data-scene-variant",
    "B",
  );
  const action = page
    .locator('.screenplay-block[data-format="action"]')
    .first();
  await action.click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+End");
  await page.keyboard.type("Alternative action.");
  await expect(action).toHaveText("Alternative action.");
  await variant.selectOption("A");
  await expect(action).toHaveText("Анна открывает окно.");
  await variant.selectOption("B");
  await expect(action).toHaveText("Alternative action.");
  const geometry = await scene(page, "scene-1").evaluate((el) => {
    const rect = (s) => el.querySelector(s).getBoundingClientRect();
    const n = rect(".scene-number"),
      v = rect("select"),
      c = rect(".outline-scene-link"),
      sheet = el.closest(".script-paper").getBoundingClientRect(),
      text = el.getBoundingClientRect();
    return {
      left: n.left - sheet.left,
      numGap: v.left - n.right,
      cardGap: c.left - v.right,
      space: text.left - c.right,
      sheet: sheet.width,
    };
  });
  expect(geometry).toMatchObject({
    left: 16,
    numGap: 16,
    cardGap: 16,
    sheet: 936,
  });
  expect(geometry.space).toBeGreaterThan(10);
  await page
    .getByRole("button", { name: "Поиск по сценарию", exact: true })
    .click();
  await page.getByLabel("Поиск по тексту").fill("Alternative");
  await expect(
    page.locator(".search-variant-badge.has-variants"),
  ).toContainText("A / B");
  await page.keyboard.press("Escape");
  await page.screenshot({ path: info.outputPath("scene-variants.png") });
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const { browserRequest } = await import("/src/browser-files.js");
        const doc = (await browserRequest("documents")).documents[0];
        return doc?.sceneVariants?.["scene-1"]?.A?.length || 0;
      }),
    )
    .toBeGreaterThan(0);
  await page.reload();
  await expect(variant).toHaveValue("B");
  await variant.selectOption("A");
  await expect(action).toHaveText("Анна открывает окно.");
  const transferred = await page.evaluate(async () => {
    const { browserRequest } = await import("/src/browser-files.js");
    const { exportTYT, readTYT } = await import("/src/tyt-format.js");
    const { switchSceneVariant } = await import("/src/scene-variants.js");
    const doc = (await browserRequest("documents")).documents.find(
      (item) => item.id === "tools-document",
    );
    const restored = readTYT(await (await exportTYT(doc)).text());
    const variant = switchSceneVariant(restored, "scene-1", "B");
    return {
      block: variant.content.content[1].content[0].text,
      link: variant.outline.cards[0].blockId,
      letters: Object.keys(variant.sceneVariants["scene-1"]).sort(),
    };
  });
  expect(transferred).toEqual({
    block: "Alternative action.",
    link: "scene-1",
    letters: ["A", "B"],
  });
});

test("doctor navigates to findings and full screen hides UI, accepts typing and restores the caret", async ({
  page,
}, info) => {
  await open(page);
  await page
    .getByRole("button", { name: "Доктор сценария", exact: true })
    .click();
  await page.getByRole("button", { name: /Не указано время суток/ }).click();
  await expect(scene(page, "scene-2")).toHaveAttribute(
    "data-outline-navigation-target",
    "true",
  );
  await page.getByRole("button", { name: "Открыть во весь экран" }).click();
  await expect(page.locator(".minimal-header")).not.toBeVisible();
  await expect(page.locator(".workspace-tools")).not.toBeVisible();
  await expect(page.locator(".doctor-drawer")).toHaveCount(0);
  await expect(page.locator(".focus-format-hint")).toContainText("Ctrl+1");
  await page.keyboard.press("End");
  await page.keyboard.type(" — NIGHT");
  await expect(scene(page, "scene-2")).toContainText("NIGHT");
  await page.screenshot({ path: info.outputPath("focus-mode.png") });
  await page
    .getByRole("button", { name: "Выйти из полноэкранного режима" })
    .click();
  await expect(page.locator(".minimal-header")).toBeVisible();
  await page.getByRole("button", { name: "Открыть во весь экран" }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".workspace-tools")).toBeVisible();
});

test("hovering a character opens only their speeches and parentheticals and can return to a scene", async ({
  page,
}, info) => {
  await open(page);
  await scene(page, "anna-1").hover();
  await scene(page, "anna-1")
    .getByRole("button", { name: "Посмотреть реплики: АННА", exact: true })
    .click();
  const reading = page.getByRole("main", { name: "Реплики персонажа" });
  await expect(reading.locator("article")).toHaveCount(2);
  await expect(reading).toContainText("(тихо)");
  await expect(reading).toContainText("Здравствуй, утро.");
  await expect(reading).toContainText("Я уже в саду.");
  await expect(reading).not.toContainText("Привет, Анна!");
  await expect(page.locator(".minimal-scroll")).not.toBeVisible();
  await page.screenshot({ path: info.outputPath("character-dialogue.png") });
  await reading.getByRole("button", { name: /2. ЭКС. САД/ }).click();
  await expect(scene(page, "anna-2")).toHaveAttribute(
    "data-outline-navigation-target",
    "true",
  );
  await expect(page.locator(".minimal-scroll")).toBeVisible();
  await scene(page, "anna-2").hover();
  await scene(page, "anna-2").getByRole("button").click();
  await page.keyboard.press("Escape");
  await expect(reading).toHaveCount(0);
});

test("library export imports into another document and is offered again from local storage", async ({
  page,
}, info) => {
  const target = createProject("Другой сценарий");
  target.id = "target";
  await open(page, [fixture(), target], true);
  await page.getByRole("button", { name: "Компоненты", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Экспорт библиотеки компонентов" })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.tytl$/);
  const path = info.outputPath("library.tytl");
  await download.saveAs(path);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Документы", exact: true }).click();
  await page
    .locator(".document-item")
    .filter({ hasText: "Другой сценарий" })
    .click();
  await page.getByRole("button", { name: "Компоненты", exact: true }).click();
  await page
    .getByRole("button", { name: "Библиотеки компонентов", exact: true })
    .click();
  await libraryDialog(page).locator('input[type="file"]').setInputFiles(path);
  await expect(libraryDialog(page)).toContainText("Анна");
  await libraryDialog(page)
    .getByRole("button", { name: "Внедрить в сценарий" })
    .click();
  await expect(libraryDialog(page)).toHaveCount(0);
  await expect(page.locator(".component-library-link")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Библиотеки компонентов", exact: true })
    .click();
  await expect(libraryDialog(page).locator(".library-list")).toContainText(
    "Новые инструменты",
  );
  await libraryDialog(page)
    .getByRole("button", { name: "Внедрить в сценарий" })
    .click();
  await expect(page.locator(".component-library-link")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Библиотеки компонентов", exact: true })
    .click();
  await libraryDialog(page)
    .locator('input[type="file"]')
    .setInputFiles({
      name: "broken.tytl",
      mimeType: "application/json",
      buffer: Buffer.from("broken"),
    });
  await expect(libraryDialog(page).getByRole("alert")).toContainText(
    "Не удалось прочитать",
  );
  await page.keyboard.press("Escape");
  await expect(libraryDialog(page)).toHaveCount(0);
});

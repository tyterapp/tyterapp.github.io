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
import { selectAppOption } from "./helpers/app-select.js";

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
  await selectAppOption(page, page.getByLabel("Тема интерфейса"), "dark");
  await page.getByRole("button", { name: "ENG", exact: true }).click();
  await expect(page.getByLabel("Typewriter sound")).not.toBeChecked();
  await expect(page.getByLabel("Interface theme")).toHaveAttribute(
    "data-value",
    "dark",
  );
  await page.screenshot({ path: info.outputPath("dark-settings.png") });
  await page.keyboard.press("Escape");
  await expect(
    scene(page, "scene-1").getByLabel("Scene 1 variant"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Script doctor", exact: true }),
  ).toHaveCount(0);
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

test("editing F before opening other variants does not copy F into their headings or dialogue", () => {
  let doc = switchSceneVariant(fixture(), "scene-1", "F");
  doc.content.content[0].content[0].text = "ИНТ. КОМНАТА F — НОЧЬ";
  doc.content.content[1].content[0].text = "Действие только в F.";
  doc.content.content[4].content[0].text = "Реплика только в F.";
  const bodyIds = new Set([doc.content.content[1].attrs.blockId]);
  for (const letter of ["B", "C", "D", "E", "A"]) {
    doc = switchSceneVariant(doc, "scene-1", letter);
    expect(nodeText(doc.content.content[0])).toBe("ИНТ. ДОМ — ДЕНЬ");
    expect(nodeText(doc.content.content[1])).toBe("Анна открывает окно.");
    expect(nodeText(doc.content.content[4])).toBe("Здравствуй, утро.");
    expect(bodyIds.has(doc.content.content[1].attrs.blockId)).toBe(false);
    bodyIds.add(doc.content.content[1].attrs.blockId);
    doc.content.content[1].content[0].text = `Действие ${letter}.`;
  }
  doc = validateImport(doc);
  for (const letter of ["F", "D", "A", "E", "B", "C", "F"]) {
    doc = switchSceneVariant(doc, "scene-1", letter);
    expect(nodeText(doc.content.content[1])).toBe(
      letter === "F" ? "Действие только в F." : `Действие ${letter}.`,
    );
    expect(nodeText(doc.content.content[0])).toBe(
      letter === "F" ? "ИНТ. КОМНАТА F — НОЧЬ" : "ИНТ. ДОМ — ДЕНЬ",
    );
    expect(doc.outline.cards[0].blockId).toBe("scene-1");
    expect(nodeText(doc.content.content[7])).toBe("ЭКС. САД");
  }
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
  await selectAppOption(page, page.getByLabel("Тема интерфейса"), "dark");
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
  await selectAppOption(page, page.getByLabel("Тема интерфейса"), "light");
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
  await selectAppOption(page, variant, "B");
  await expect(variant).toHaveAttribute("data-value", "B");
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
  await selectAppOption(page, variant, "A");
  await expect(action).toHaveText("Анна открывает окно.");
  await selectAppOption(page, variant, "B");
  await expect(action).toHaveText("Alternative action.");
  const geometry = await scene(page, "scene-1").evaluate((el) => {
    const rect = (s) => el.querySelector(s).getBoundingClientRect();
    const n = rect(".scene-number"),
      v = rect(".scene-variant-select"),
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
    cardGap: 8,
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
  await expect(variant).toHaveAttribute("data-value", "B");
  await selectAppOption(page, variant, "A");
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

test("F stays independent when other variants are first opened; switching does not flash the scene", async ({
  page,
}) => {
  await open(page, [fixture()], true);
  await page.evaluate(() => {
    window.variantNavigationFlashes = 0;
    new MutationObserver(() => {
      if (
        document.querySelector(
          ".outline-navigation-flash, [data-outline-navigation-target]",
        )
      )
        window.variantNavigationFlashes++;
    }).observe(document.querySelector(".screenplay-editor"), {
      subtree: true,
      childList: true,
      attributes: true,
    });
  });
  const variant = scene(page, "scene-1").getByLabel("Вариант сцены 1", {
    exact: true,
  });
  const action = page
    .locator('.screenplay-block[data-format="action"]')
    .first();
  const replaceLine = async (line, text) => {
    await line.click();
    await page.keyboard.press("Home");
    await page.keyboard.press("Shift+End");
    await page.keyboard.insertText(text);
  };
  const headingText = () =>
    scene(page, "scene-1").evaluate((node) => {
      const copy = node.cloneNode(true);
      copy
        .querySelectorAll(".ProseMirror-widget")
        .forEach((widget) => widget.remove());
      return copy.textContent;
    });
  await selectAppOption(page, variant, "F");
  await replaceLine(scene(page, "scene-1"), "ИНТ. КОМНАТА F — НОЧЬ");
  await replaceLine(action, "Только вариант F.");
  for (const letter of ["B", "C", "D", "E", "A"]) {
    await selectAppOption(page, variant, letter);
    await expect(action).toHaveText("Анна открывает окно.");
    expect(await headingText()).toBe("ИНТ. ДОМ — ДЕНЬ");
    await replaceLine(action, `Вариант ${letter}.`);
  }
  for (const letter of ["F", "D", "B", "A", "E", "C", "F"]) {
    await selectAppOption(page, variant, letter);
    await expect(action).toHaveText(
      letter === "F" ? "Только вариант F." : `Вариант ${letter}.`,
    );
    expect(await headingText()).toBe(
      letter === "F" ? "ИНТ. КОМНАТА F — НОЧЬ" : "ИНТ. ДОМ — ДЕНЬ",
    );
    await expect(page.locator(".screenplay-editor")).toBeFocused();
  }
  expect(await page.evaluate(() => window.variantNavigationFlashes)).toBe(0);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const { browserRequest } = await import("/src/browser-files.js");
        const doc = (await browserRequest("documents")).documents[0];
        return Object.keys(doc?.sceneVariants?.["scene-1"] || {}).length;
      }),
    )
    .toBe(6);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const { browserRequest } = await import("/src/browser-files.js");
        const doc = (await browserRequest("documents")).documents[0];
        return doc.content.content[0].attrs.sceneVariant;
      }),
    )
    .toBe("F");
  await page.reload();
  await expect(variant).toHaveAttribute("data-value", "F");
  await expect(action).toHaveText("Только вариант F.");
  await selectAppOption(page, variant, "D");
  await expect(action).toHaveText("Вариант D.");
  await selectAppOption(page, variant, "F");
  await expect(action).toHaveText("Только вариант F.");
});

test("full screen hides UI, keeps readable hints, accepts typing and restores the caret", async ({
  page,
}, info) => {
  await open(page);
  await expect(
    page.getByRole("button", { name: "Доктор сценария", exact: true }),
  ).toHaveCount(0);
  await scene(page, "scene-2").click();
  await page.getByRole("button", { name: "Открыть во весь экран" }).click();
  await expect(page.locator(".minimal-header")).not.toBeVisible();
  await expect(page.locator(".workspace-tools")).not.toBeVisible();
  await expect(page.locator(".doctor-drawer")).toHaveCount(0);
  await expect(page.locator(".focus-format-hint")).toContainText("Ctrl+1");
  await expect(page.locator(".focus-format-hint")).toHaveCSS("opacity", "1");
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

test("sidebar opens all dialogue, filters a character and can return to a scene", async ({
  page,
}, info) => {
  await open(page);
  await scene(page, "anna-1").hover();
  await expect(page.locator(".character-dialogue-link")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Реплики персонажей", exact: true })
    .click();
  const reading = page.getByRole("main", { name: "Реплики персонажа" });
  await expect(reading.locator("article")).toHaveCount(3);
  await expect(reading.locator("article h3")).toHaveText([
    "АННА",
    "БОРИС",
    "АННА (З.К.)",
  ]);
  await reading
    .getByRole("navigation", { name: "Персонажи сценария" })
    .getByRole("button", { name: /^АННА/ })
    .click();
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
  await page
    .getByRole("button", { name: "Реплики персонажей", exact: true })
    .click();
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
    .locator(".library-list button")
    .filter({ hasText: "Новые инструменты" })
    .click();
  await libraryDialog(page)
    .getByRole("button", { name: "Применить", exact: true })
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

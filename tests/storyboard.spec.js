import { test, expect } from "@playwright/test";
import { createCanvas } from "@napi-rs/canvas";
import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { unzipSync, strFromU8 } from "fflate";
import { createProject } from "../src/data.js";
import { grantPro } from "./helpers/pro-access.js";
test.setTimeout(60000);
const image = (color) => {
  const c = createCanvas(640, 360),
    x = c.getContext("2d");
  x.fillStyle = color;
  x.fillRect(0, 0, 640, 360);
  x.fillStyle = "white";
  x.font = "40px sans-serif";
  x.fillText(color, 30, 190);
  return c.toDataURL("image/png");
};
const red = image("#a8464c"),
  blue = image("#3d6fa0"),
  green = image("#579571");
const p = (format, text, id) => ({
  type: "paragraph",
  attrs: { format, blockId: id },
  content: [{ type: "text", text }],
});
function fixture() {
  const doc = createProject("История на холме");
  doc.id = "storyboard-test";
  doc.components = [
    { id: "rabbit", name: "ПЯТАЧОК", aliases: ["ПЯТАК"], type: "character" },
  ];
  doc.content.content = [
    p("scene", "ЭКС. ХОЛМ — ДЕНЬ", "one"),
    p("action", "Два кролика встречаются на холме.", "action-one"),
    p("character", "ПЯТАЧОК", "character"),
    p("speech", "Ты слышишь это?", "speech"),
    p("scene", "ИНТ. ДОМ — НОЧЬ", "two"),
    p("action", "Тихая комната.", "action-two"),
    p("scene", "ЭКС. РЕКА — УТРО", "three"),
    p("action", "Герой возвращается.", "action-three"),
  ];
  doc.sceneShots = {
    one: {
      A: {
        frames: [
          { id: "r", image: red, durationMs: 300, transition: "cut" },
          { id: "b", image: blue, durationMs: 700, transition: "fade" },
          { id: "empty", image: "", durationMs: 5000, transition: "cut" },
        ],
        drama: 4,
        act: 1,
        status: "production",
        playbackLoop: false,
      },
    },
    two: {
      A: {
        frames: [
          { id: "g", image: green, durationMs: 5000, transition: "cut" },
        ],
        drama: 8,
      },
    },
  };
  return doc;
}
async function open(
  page,
  { theme = "dark", width = 1600, language = "ru" } = {},
) {
  await grantPro(page);
  await page.setViewportSize({ width, height: 1000 });
  await page.route("**/__tyter_local/**", (r) => r.fulfill({ status: 404 }));
  await page.addInitScript(
    ({ doc, theme, language }) => {
      if (sessionStorage.getItem("story-seed")) return;
      sessionStorage.setItem("story-seed", "1");
      localStorage.setItem("tyter.projects.v1", JSON.stringify([doc]));
      localStorage.setItem("tyter.active", doc.id);
      localStorage.setItem("tyter.onboarding.v1", "done");
      localStorage.setItem("tyter.editor-intro.v1", "seen");
      localStorage.setItem("tyter.language.v1", language);
      localStorage.setItem(
        "tyter.editor-preferences.v1",
        JSON.stringify({ theme }),
      );
    },
    { doc: fixture(), theme, language },
  );
  await page.goto("/beta");
  await expect(page.locator(".screenplay-editor")).toBeVisible();
}
const boardButton = (page) =>
  page
    .locator(".document-view-toggle")
    .getByRole("button", { name: "Раскадровка", exact: true });
const card = (page, id) => page.locator(`.story-card[data-scene="${id}"]`);
const panel = (page) => page.locator(".story-inspector");
for (const language of ["ru", "en"])
  test(`${language}: structure icons match text formats and reveal the exact screenplay block`, async ({
    page,
  }) => {
    await open(page, { language });
    await page
      .locator(".document-view-toggle")
      .getByRole("button", {
        name: language === "en" ? "Storyboard" : "Раскадровка",
        exact: true,
      })
      .click();
    await card(page, "one").getByRole("button").click();
    const block = panel(page).locator('[data-block="speech"]');
    const reveal = block.locator(".story-block-reveal");
    await expect(reveal.locator(".story-format-icon")).toHaveCSS(
      "mask-image",
      /speech\.svg/,
    );
    await expect(reveal).toHaveAccessibleName(
      language === "en"
        ? "Show in screenplay: Dialogue 4"
        : "Показать в сценарии: Диалог 4",
    );
    await reveal.click();
    await expect(page.locator(".screenplay-editor")).toBeVisible();
    await expect(panel(page)).toBeVisible();
    await expect
      .poll(() =>
        page
          .locator(".screenplay-editor")
          .evaluate((e) => e.editor.state.selection.$head.parent.attrs.blockId),
      )
      .toBe("speech");
    await expect(
      page.locator('.screenplay-editor [data-block-id="speech"]'),
    ).toHaveAttribute("data-outline-navigation-target", "true");
    await expect(
      panel(page).locator('[data-block="character"] .story-format-icon'),
    ).toHaveCSS("mask-image", /character\.svg/);
    await expect(
      panel(page).locator('[data-block="action-one"] .story-format-icon'),
    ).toHaveCSS("mask-image", /action\.svg/);
    await page.screenshot({ path: `.cache/structure-icons-${language}.png` });
  });
async function info(page, detail = false) {
  await panel(page).getByRole("tab", { name: "Инфо", exact: true }).click();
  if (detail)
    await panel(page)
      .getByRole("tab", { name: "DETAILS", exact: true })
      .click();
}
for (const theme of ["light", "dark"])
  test(`${theme}: storyboard replaces outline, shares scene structure and stores shot details`, async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await open(page, { theme });
    await expect(
      page.getByRole("button", { name: "Аутлайн", exact: true }),
    ).toHaveCount(0);
    await boardButton(page).click();
    await expect(page.locator(".story-card")).toHaveCount(3);
    await card(page, "one").getByRole("button").click();
    await expect(panel(page).locator("textarea:visible")).toHaveCount(0);
    await page.screenshot({ path: `.cache/storyboard-compact-${theme}.png` });
    await panel(page)
      .getByRole("button", { name: "Действие", exact: true })
      .click();
    await panel(page)
      .getByRole("textbox", { name: "Действие 2", exact: true })
      .fill("Кролики наблюдают за облаками.");
    await panel(page)
      .getByRole("button", { name: "Добавить блок текста", exact: true })
      .click();
    await panel(page)
      .getByRole("button", { name: "Добавить", exact: true })
      .click();
    await expect(panel(page).locator(".story-structure-block")).toHaveCount(5);
    await info(page, true);
    await panel(page).getByLabel("Номер акта", { exact: true }).fill("2");
    await panel(page)
      .getByLabel("Статус сцены", { exact: true })
      .selectOption("post-production");
    await panel(page).getByLabel("Драматичность", { exact: true }).fill("1");
    await panel(page)
      .getByLabel("Описание сцены", { exact: true })
      .fill("Начало приключения.");
    await panel(page)
      .getByRole("button", { name: "График драматичности", exact: true })
      .click();
    await expect(
      page.getByRole("group", { name: "Драматичность сцен от 1 до 10" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Закрыть график", exact: true })
      .click();
    await panel(page)
      .getByRole("button", { name: "Дата съёмок", exact: true })
      .click();
    await panel(page)
      .getByLabel("Дата съёмок", { exact: true })
      .fill("2026-12-15");
    await page.screenshot({ path: `.cache/storyboard-${theme}.png` });
    await panel(page)
      .getByRole("button", { name: "Вернуться к сценарию", exact: true })
      .click();
    await expect(page.locator(".screenplay-editor")).toContainText(
      "Кролики наблюдают за облаками.",
    );
    await expect(panel(page)).toBeVisible();
    await panel(page)
      .getByRole("button", { name: "Посмотреть раскадровку", exact: true })
      .click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            new Promise((resolve, reject) => {
              const opening = indexedDB.open("tyter.local-files.v1", 1);
              opening.onerror = () => reject(opening.error);
              opening.onsuccess = () => {
                const database = opening.result;
                const read = database
                  .transaction("files")
                  .objectStore("files")
                  .get("documents");
                read.onerror = () => reject(read.error);
                read.onsuccess = () => {
                  resolve(
                    read.result?.find((doc) => doc.id === "storyboard-test")
                      ?.sceneShots?.one?.A?.synopsis,
                  );
                  database.close();
                };
              };
            }),
        ),
      )
      .toBe("Начало приключения.");
    await page.reload();
    await boardButton(page).click();
    await card(page, "one").getByRole("button").click();
    await info(page, true);
    await expect(
      panel(page).getByLabel("Описание сцены", { exact: true }),
    ).toHaveValue("Начало приключения.");
    await expect(
      panel(page).getByLabel("Драматичность", { exact: true }),
    ).toHaveValue("1");
    await expect(
      panel(page).getByLabel("Номер акта", { exact: true }),
    ).toHaveValue("2");
    expect(errors).toEqual([]);
  });
test("slides respect hover timing, clipboard appends to illustrated scenes, variants stay isolated and Undo restores settings", async ({
  page,
}) => {
  await open(page);
  await boardButton(page).click();
  const preview = card(page, "one").locator(".story-image img");
  await expect(preview).toHaveAttribute("src", red);
  await preview.hover();
  await expect(preview).toHaveAttribute("src", blue);
  await page.mouse.move(50, 200);
  await expect(preview).toHaveAttribute("src", red);
  await card(page, "one").getByRole("button").click();
  await info(page);
  await expect(
    panel(page).locator(".story-frame-slot[data-frame]"),
  ).toHaveCount(3);
  await page.locator(".storyboard-workspace").evaluate((element, data) => {
    const bytes = Uint8Array.from(atob(data.split(",")[1]), (c) =>
      c.charCodeAt(0),
    );
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], "pasted.png", { type: "image/png" }));
    element.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: transfer,
      }),
    );
  }, green);
  await expect(page.locator(".story-paste-dialog")).toHaveCount(0);
  await expect(
    panel(page).locator(".story-frame-slot[data-frame]"),
  ).toHaveCount(4);
  await expect(panel(page).locator('[data-frame="empty"] img')).toHaveCount(0);
  await expect(
    panel(page).locator(".story-frame-slot[data-frame]").last().locator("img"),
  ).toHaveAttribute("src", green);
  await panel(page)
    .getByLabel("Вариант сцены 1", { exact: true })
    .selectOption("B");
  await expect(
    panel(page).locator(".story-frame-slot[data-frame]"),
  ).toHaveCount(0);
  await panel(page)
    .getByRole("button", { name: "Добавить свободный слот", exact: true })
    .click();
  await expect(
    panel(page).locator(".story-frame-slot[data-frame]"),
  ).toHaveCount(1);
  await page.keyboard.press("Control+z");
  await expect(
    panel(page).locator(".story-frame-slot[data-frame]"),
  ).toHaveCount(0);
  await panel(page)
    .getByLabel("Вариант сцены 1", { exact: true })
    .selectOption("A");
  await expect(
    panel(page).locator(".story-frame-slot[data-frame]"),
  ).toHaveCount(4);
  await expect(panel(page).locator('[data-frame="empty"] img')).toHaveCount(0);
  await panel(page)
    .locator('[data-frame="b"]')
    .dragTo(panel(page).locator('[data-frame="r"]'));
  await expect(
    panel(page).locator(".story-frame-slot[data-frame]").first(),
  ).toHaveAttribute("data-frame", "b");
  await card(page, "three").dragTo(card(page, "one"));
  await expect(page.locator(".story-card").first()).toHaveAttribute(
    "data-scene",
    "three",
  );
});
test("exports separate PNG/WEBP files, portable JSON, a readable PDF and complete TYT", async ({
  page,
}) => {
  await open(page);
  await boardButton(page).click();
  const download = async (name) => {
    await page
      .getByRole("button", { name: "Экспорт раскадровки", exact: true })
      .click();
    const promise = page.waitForEvent("download");
    await page.getByRole("menuitem", { name: new RegExp(name) }).click();
    const result = await promise;
    return { result, bytes: await fs.readFile(await result.path()) };
  };
  for (const format of ["PNG", "WEBP"]) {
    const { bytes } = await download(`${format} sequence`);
    const files = unzipSync(bytes);
    expect(
      Object.keys(files).filter((name) =>
        name.endsWith(`.${format.toLowerCase()}`),
      ),
    ).toHaveLength(4);
    const manifest = JSON.parse(strFromU8(files["storyboard.json"]));
    expect(manifest.scenes[0].frames.map((f) => f.durationMs)).toEqual([
      300, 700, 5000,
    ]);
    expect(manifest.scenes[0].frames[1].file).toBe(
      `page-001_v1-White_scene-001-A_ЭКС. ХОЛМ — ДЕНЬ_frame-002.${format.toLowerCase()}`,
    );
    const head = files[manifest.scenes[0].frames[0].file];
    expect(
      format === "PNG" ? [...head.slice(0, 4)] : strFromU8(head.slice(0, 4)),
    ).toEqual(format === "PNG" ? [137, 80, 78, 71] : "RIFF");
  }
  const json = JSON.parse((await download("^JSON")).bytes.toString());
  expect(json.format).toBe("tyter-storyboard");
  expect(json.scenes[0].frames[0].image).toBe(red);
  const pdf = await download("^PDF");
  expect(pdf.result.suggestedFilename()).toMatch(/\.pdf$/);
  expect(pdf.bytes.subarray(0, 4).toString()).toBe("%PDF");
  await fs.writeFile(".cache/storyboard-export.pdf", pdf.bytes);
  const tyt = JSON.parse((await download("Tyter project")).bytes.toString());
  expect(tyt.document.sceneShots.one.A.frames).toHaveLength(3);
  expect(tyt.document.content.content).toHaveLength(8);
});

test("main export menu exports the full sequence and the JSON for its current mode", async ({
  page,
}, info) => {
  await open(page);
  const editor = page.locator(".screenplay-editor");
  await editor.evaluate((node) => node.editor.commands.focus("end"));
  await page.keyboard.type(" LAST_EDIT");
  const railDownload = async (mode, name) => {
    await page
      .getByRole("button", {
        name:
          mode === "storyboard" ? "Скачать раскадровку" : "Скачать сценарий",
        exact: true,
      })
      .click();
    const menu = page.locator(".rail-export-menu");
    const pending = page.waitForEvent("download");
    await menu.getByRole("button", { name: new RegExp(name) }).click();
    const file = await pending;
    return { file, bytes: await fs.readFile(await file.path()) };
  };
  const screenplay = await railDownload("screenplay", "JSON · Сценарий");
  const script = JSON.parse(screenplay.bytes.toString());
  expect(script.format).toBe("tyter-screenplay");
  expect(script.content.content.at(-1).content[0].text).toContain("LAST_EDIT");
  expect(script.sceneShots.one.A.frames).toHaveLength(3);
  expect(script.storyboard.scenes[0].frames[1].transition).toBe("fade");
  const sequence = await railDownload("screenplay", "PNG sequence");
  expect(sequence.file.suggestedFilename()).toMatch(/\.zip$/);
  const files = unzipSync(sequence.bytes);
  const manifest = JSON.parse(strFromU8(files["storyboard.json"]));
  expect(manifest.scenes).toHaveLength(3);
  expect(
    Object.keys(files).filter((name) => name.endsWith(".png")),
  ).toHaveLength(4);
  expect(manifest.scenes[1].frames[0].file).toContain(
    "scene-002-A_ИНТ. ДОМ — НОЧЬ",
  );
  await boardButton(page).click();
  await card(page, "one").click();
  const storyboard = await railDownload("storyboard", "JSON · Все сцены");
  const board = JSON.parse(storyboard.bytes.toString());
  expect(board.format).toBe("tyter-storyboard");
  expect(board.scenes).toHaveLength(3);
  expect(board.scenes[1].frames[0].image).toBe(green);
  expect(board.scenes[2].frames).toEqual([]);
  await page
    .getByRole("button", { name: "Скачать раскадровку", exact: true })
    .click();
  await expect(
    page.locator(".rail-export-menu").getByRole("button", { name: /Word/ }),
  ).toHaveCount(0);
  await page
    .locator(".rail-export-menu")
    .screenshot({ path: info.outputPath("storyboard-export-menu.png") });
});

test("Instant HTML opens offline with both read-only views and opens the free editor", async ({
  page,
  context,
}, info) => {
  await open(page);
  const pendingHTML = async (board = false) => {
    await page
      .getByRole("button", {
        name: board ? "Скачать раскадровку" : "Скачать сценарий",
        exact: true,
      })
      .click();
    const pending = page.waitForEvent("download");
    await page
      .locator(".rail-export-menu")
      .getByRole("button", { name: /Instant link · HTML/ })
      .click();
    const download = await pending;
    expect(download.suggestedFilename()).toMatch(/\.html$/);
    const target = info.outputPath(
      board ? "storyboard-reader.html" : "screenplay-reader.html",
    );
    await download.saveAs(target);
    return target;
  };
  const target = await pendingHTML();
  const reader = await context.newPage();
  await reader.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  const requests = [],
    errors = [];
  reader.on("request", (request) => {
    if (/^https?:/.test(request.url())) requests.push(request.url());
  });
  reader.on("pageerror", (error) => errors.push(error.message));
  await reader.goto(pathToFileURL(target).href);
  await expect(
    reader.getByRole("tab", { name: "Сценарий", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(reader.locator("#screenplay")).toContainText(
    "Два кролика встречаются на холме.",
  );
  await expect(
    reader.locator(
      "[contenteditable], input, textarea, .screenplay-editor, .story-inspector",
    ),
  ).toHaveCount(0);
  await reader.getByRole("tab", { name: "Раскадровка", exact: true }).click();
  await expect(reader.locator("#storyboard")).toBeVisible();
  await expect(reader.locator(".board-scene")).toHaveCount(3);
  await expect(reader.locator(".frames img")).toHaveCount(3);
  await expect
    .poll(() =>
      reader
        .locator(".frames img")
        .first()
        .evaluate((image) => image.naturalWidth),
    )
    .toBe(640);
  expect(
    await reader
      .locator(".frame-media")
      .first()
      .evaluate((node) => {
        const frame = node.getBoundingClientRect(),
          image = node.querySelector("img").getBoundingClientRect();
        return (
          Math.abs(frame.width - image.width) +
          Math.abs(frame.height - image.height)
        );
      }),
  ).toBeLessThan(1);
  await reader.screenshot({
    path: info.outputPath("instant-html-desktop.png"),
    fullPage: true,
  });
  await reader.setViewportSize({ width: 320, height: 844 });
  await reader.emulateMedia({ colorScheme: "dark" });
  expect(
    await reader.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
  ).toBe(0);
  await reader.screenshot({
    path: info.outputPath("instant-html-mobile.png"),
    fullPage: true,
  });
  await reader.getByRole("tab", { name: "Раскадровка", exact: true }).focus();
  await reader.keyboard.press("ArrowLeft");
  await expect(reader.locator("#screenplay")).toBeVisible();
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
  await reader.route("**/free", (route) =>
    route.fulfill({ contentType: "text/html", body: "<p>Free editor</p>" }),
  );
  await reader
    .getByRole("link", { name: "Редактировать", exact: true })
    .click();
  await expect(reader).toHaveURL(/\/free$/);
  await boardButton(page).click();
  const boardTarget = await pendingHTML(true);
  await reader.goto(pathToFileURL(boardTarget).href);
  await expect(
    reader.getByRole("tab", { name: "Раскадровка", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await reader.close();
});

test("reader footer shares and downloads the active view offline without exposing private project data", async ({
  page,
  context,
}, info) => {
  await open(page);
  await page
    .getByRole("button", { name: "Скачать сценарий", exact: true })
    .click();
  const pending = page.waitForEvent("download");
  await page
    .locator(".rail-export-menu")
    .getByRole("button", { name: /Instant link · HTML/ })
    .click();
  const exported = await pending,
    file = info.outputPath("reader-actions.html");
  await exported.saveAs(file);
  const reader = await context.newPage();
  await reader.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  await reader.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: undefined,
    });
    window.print = () => {
      window.printedReader = true;
    };
  });
  await reader.goto(pathToFileURL(file).href);
  const downloadFormat = async (format) => {
    await reader.getByRole("button", { name: "Скачать", exact: true }).click();
    const downloading = reader.waitForEvent("download");
    await reader
      .locator("#reader-download-menu")
      .getByRole("menuitem", { name: new RegExp(format) })
      .click();
    const result = await downloading;
    return { result, bytes: await fs.readFile(await result.path()) };
  };
  const script = JSON.parse((await downloadFormat("^JSON")).bytes.toString());
  expect(script.format).toBe("tyter-screenplay");
  expect(script.content.content).toHaveLength(8);
  expect(script.sceneShots.one.A.frames[0].image).toBe(red);
  expect(script.sceneShots.one.A.frames[1].durationMs).toBe(700);
  expect(script.sceneShots.one.A.frames[1].transition).toBe("fade");
  expect(script).not.toHaveProperty("notes");
  expect(script).not.toHaveProperty("history");
  expect((await downloadFormat("Текст · TXT")).bytes.toString()).toContain(
    "Ты слышишь это?",
  );
  await reader.getByRole("tab", { name: "Раскадровка", exact: true }).click();
  const board = JSON.parse((await downloadFormat("^JSON")).bytes.toString());
  expect(board.format).toBe("tyter-storyboard");
  expect(board.scenes).toHaveLength(3);
  expect(board.scenes[1].frames[0].image).toBe(green);
  await reader.getByRole("button", { name: "Скачать", exact: true }).click();
  await expect(reader.locator('[data-format="txt"]')).toBeHidden();
  await reader.getByRole("menuitem", { name: /PDF/ }).click();
  expect(await reader.evaluate(() => window.printedReader)).toBe(true);
  const saved = await downloadFormat("^HTML");
  const copy = info.outputPath("reader-actions-copy.html");
  await saved.result.saveAs(copy);
  await reader.goto(pathToFileURL(copy).href);
  await expect(reader.locator("#storyboard")).toBeVisible();
  expect(
    JSON.parse((await downloadFormat("^JSON")).bytes.toString()).scenes[0]
      .frames[0].image,
  ).toBe(red);
  await reader.getByRole("button", { name: "Поделиться", exact: true }).click();
  const dialog = reader.getByRole("dialog", { name: "Поделиться документом" });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Копировать ссылку" }),
  ).toBeHidden();
  const sharing = reader.waitForEvent("download");
  await dialog
    .getByRole("button", { name: "Скачать HTML для отправки" })
    .click();
  expect((await sharing).suggestedFilename()).toMatch(/\.html$/);
  await expect(dialog).not.toBeVisible();
  await reader.setViewportSize({ width: 320, height: 844 });
  await reader.getByRole("button", { name: "Скачать", exact: true }).click();
  const menu = await reader.locator("#reader-download-menu").boundingBox();
  expect(menu.x).toBeGreaterThanOrEqual(0);
  expect(menu.x + menu.width).toBeLessThanOrEqual(320);
  await reader.screenshot({
    path: info.outputPath("reader-footer-mobile.png"),
    fullPage: true,
  });
  await reader.keyboard.press("Escape");
  await reader.evaluate(() => {
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: () => true,
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data) => {
        window.sharedReader = {
          type: data.files[0].type,
          name: data.files[0].name,
        };
      },
    });
  });
  await reader.getByRole("button", { name: "Поделиться", exact: true }).click();
  expect((await reader.evaluate(() => window.sharedReader)).type).toBe(
    "text/html",
  );
  await reader.route("https://reader.example.test/story.html", (route) =>
    route.fulfill({ contentType: "text/html", body: saved.bytes }),
  );
  await reader.goto("https://reader.example.test/story.html");
  await reader.getByRole("tab", { name: "Сценарий", exact: true }).click();
  await reader.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text) => {
          window.copiedReaderLink = text;
        },
      },
    });
  });
  await reader.getByRole("button", { name: "Поделиться", exact: true }).click();
  await reader
    .getByRole("button", { name: "Копировать ссылку", exact: true })
    .click();
  expect(await reader.evaluate(() => window.copiedReaderLink)).toBe(
    "https://reader.example.test/story.html#screenplay",
  );
  await reader.close();
});
test("mobile bottom tabs, real two-finger pinch and long press reorder", async ({
  page,
  context,
}) => {
  await open(page, { width: 390 });
  const tabs = page.locator(".mobile-mode-tabs");
  await expect(tabs).toBeVisible();
  await expect(page.locator(".document-view-toggle")).toBeHidden();
  await tabs.getByRole("button", { name: "Раскадровка", exact: true }).click();
  await expect(page.locator(".story-card")).toHaveCount(3);
  const cdp = await context.newCDPSession(page);
  const touch = async (type, points) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: points.map(([id, x, y]) => ({
        id,
        x,
        y,
        radiusX: 2,
        radiusY: 2,
        force: 1,
      })),
    });
  const viewport = await page.locator(".story-board-scroll").boundingBox();
  const y = viewport.y + 150;
  const width = await card(page, "one")
    .locator(".story-image")
    .evaluate((e) => e.getBoundingClientRect().width);
  await touch("touchStart", [
    [1, 120, y],
    [2, 260, y],
  ]);
  await touch("touchMove", [
    [1, 70, y],
    [2, 310, y],
  ]);
  await touch("touchEnd", []);
  await expect
    .poll(() =>
      card(page, "one")
        .locator(".story-image")
        .evaluate((e) => e.getBoundingClientRect().width),
    )
    .toBeGreaterThan(width);
  await touch("touchStart", [
    [1, 70, y],
    [2, 310, y],
  ]);
  await touch("touchMove", [
    [1, 150, y],
    [2, 230, y],
  ]);
  await touch("touchEnd", []);
  await expect
    .poll(() =>
      card(page, "one")
        .locator(".story-image")
        .evaluate((e) => e.getBoundingClientRect().width),
    )
    .toBeLessThan(width);
  const source = await card(page, "three").boundingBox(),
    target = await card(page, "one").boundingBox();
  await touch("touchStart", [[1, source.x + 30, source.y + 25]]);
  await page.waitForTimeout(500);
  await touch("touchMove", [[1, target.x + 30, target.y + 25]]);
  await touch("touchEnd", []);
  await expect(page.locator(".story-card").first()).toHaveAttribute(
    "data-scene",
    "three",
  );
  await page.screenshot({ path: ".cache/storyboard-mobile.png" });
  await card(page, "one").getByRole("button").click();
  await info(page);
  await expect(panel(page)).toBeVisible();
  expect((await panel(page).boundingBox()).width).toBeLessThanOrEqual(390);
  const slideFrom = await panel(page).locator('[data-frame="b"]').boundingBox(),
    slideTo = await panel(page).locator('[data-frame="r"]').boundingBox();
  await touch("touchStart", [[1, slideFrom.x + 25, slideFrom.y + 20]]);
  await page.waitForTimeout(500);
  await touch("touchMove", [[1, slideTo.x + 25, slideTo.y + 20]]);
  await touch("touchEnd", []);
  await expect(
    panel(page).locator(".story-frame-slot[data-frame]").first(),
  ).toHaveAttribute("data-frame", "b");
});
test("English controls keep screenplay text and provide the mobile mode tabs", async ({
  page,
}) => {
  await open(page, { language: "en" });
  const original = await page.locator(".screenplay-editor").textContent();
  await page
    .locator(".document-view-toggle")
    .getByRole("button", { name: "Storyboard", exact: true })
    .click();
  await card(page, "one").getByRole("button").click();
  await panel(page).getByRole("tab", { name: "Info", exact: true }).click();
  await expect(
    panel(page).getByRole("button", { name: "Add images", exact: true }),
  ).toBeVisible();
  await panel(page).getByRole("tab", { name: "DETAILS", exact: true }).click();
  await expect(
    panel(page).getByLabel("Act number", { exact: true }),
  ).toBeVisible();
  await expect(
    panel(page).getByLabel("Scene status", { exact: true }),
  ).toBeVisible();
  await page
    .locator(".document-view-toggle")
    .getByRole("button", { name: "Screenplay", exact: true })
    .click();
  expect(await page.locator(".screenplay-editor").textContent()).toBe(original);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page
      .locator(".mobile-mode-tabs")
      .getByRole("button", { name: "Storyboard", exact: true }),
  ).toBeVisible();
});

test("editing scene structure repaginates the hidden screenplay and new scenes join the board", async ({
  page,
}) => {
  await open(page);
  await boardButton(page).click();
  await card(page, "one").getByRole("button").click();
  const longText = "История продолжается на следующей странице. ".repeat(240);
  await panel(page)
    .getByRole("button", { name: "Действие", exact: true })
    .click();
  await panel(page)
    .getByRole("textbox", { name: "Действие 2", exact: true })
    .fill(longText);
  await expect
    .poll(() => page.locator(".story-page-group").count())
    .toBeGreaterThan(1);
  await page
    .getByRole("button", { name: "Добавить сцену", exact: true })
    .click();
  await expect(page.locator(".story-card")).toHaveCount(4);
  await expect(panel(page).locator(".story-scene-title")).toContainText("4");
  await panel(page)
    .getByRole("button", { name: "Изменить заголовок сцены", exact: true })
    .click();
  await panel(page)
    .getByRole("textbox", { name: "Заголовок 1", exact: true })
    .fill("ЭКС. НОВАЯ ЛОКАЦИЯ — НОЧЬ");
  await panel(page)
    .getByRole("button", { name: "Вернуться к сценарию", exact: true })
    .click();
  await expect(page.locator(".screenplay-editor")).toContainText(
    "ЭКС. НОВАЯ ЛОКАЦИЯ — НОЧЬ",
  );
  await expect(page.locator(".screenplay-editor")).toContainText(
    longText.trim(),
  );
});

test("structure editing updates automatic character and alias links", async ({
  page,
}) => {
  await open(page);
  await boardButton(page).click();
  await card(page, "one").getByRole("button").click();
  await panel(page)
    .getByRole("button", { name: "Персонаж", exact: true })
    .click();
  await panel(page)
    .getByRole("textbox", { name: "Персонаж 3", exact: true })
    .fill("ПЯТАК");
  const character = () =>
    page
      .locator(".screenplay-editor")
      .evaluate((element) =>
        element.editor
          .getJSON()
          .content.find((node) => node.attrs.blockId === "character"),
      );
  await expect
    .poll(async () =>
      (await character()).content.every((node) =>
        node.marks?.some(
          (mark) => mark.type === "entity" && mark.attrs.id === "rabbit",
        ),
      ),
    )
    .toBe(true);
  await panel(page)
    .getByRole("textbox", { name: "Персонаж 3", exact: true })
    .fill("ДРУГОЙ ГЕРОЙ");
  await expect
    .poll(async () =>
      (await character()).content.some((node) =>
        node.marks?.some(
          (mark) => mark.type === "entity" && mark.attrs.automatic,
        ),
      ),
    )
    .toBe(false);
});

async function mouseDrag(page, from, to, cancel = false) {
  await from.scrollIntoViewIfNeeded();
  const start = await from.boundingBox(),
    end = await to.boundingBox();
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, {
    steps: 12,
  });
  if (cancel) await page.keyboard.press("Escape");
  await page.mouse.up();
}
async function pasteImage(page, color = green) {
  await page.locator(".storyboard-workspace").evaluate((element, data) => {
    const bytes = Uint8Array.from(atob(data.split(",")[1]), (char) =>
      char.charCodeAt(0),
    );
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], "pasted.png", { type: "image/png" }));
    element.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: transfer,
      }),
    );
  }, color);
}
test("image paste without selection appends scenes; empty scene uses its first slot and further paste appends; Undo restores everything", async ({
  page,
}) => {
  await open(page);
  await boardButton(page).click();
  await pasteImage(page);
  await expect(page.locator(".story-card")).toHaveCount(4);
  const id = await page
    .locator(".story-card")
    .last()
    .getAttribute("data-scene");
  await info(page);
  await expect(
    panel(page).locator(".story-frame-slot[data-frame]"),
  ).toHaveCount(1);
  await expect(panel(page).locator(".story-frame-slot img")).toHaveAttribute(
    "src",
    green,
  );
  await page.keyboard.press("Control+z");
  await expect(page.locator(".story-card")).toHaveCount(3);
  await page.keyboard.press("Control+Shift+z");
  await expect(card(page, id)).toBeVisible();
  await card(page, "three").locator(".story-card-select").click();
  await info(page);
  await panel(page)
    .getByRole("button", { name: "Добавить свободный слот", exact: true })
    .click();
  const emptyId = await panel(page)
    .locator(".story-frame-slot[data-frame]")
    .first()
    .getAttribute("data-frame");
  await pasteImage(page, red);
  await expect(
    panel(page).locator(".story-frame-slot[data-frame]"),
  ).toHaveCount(1);
  await expect(
    panel(page).locator(`[data-frame="${emptyId}"] img`),
  ).toHaveAttribute("src", red);
  await pasteImage(page, blue);
  await expect(
    panel(page).locator(".story-frame-slot[data-frame]"),
  ).toHaveCount(2);
  await expect(
    panel(page).locator(".story-frame-slot[data-frame]").last().locator("img"),
  ).toHaveAttribute("src", blue);
  await page.keyboard.press("Control+z");
  await expect(
    panel(page).locator(".story-frame-slot[data-frame]"),
  ).toHaveCount(1);
  await page.waitForTimeout(700);
  await page.reload();
  await boardButton(page).click();
  await expect(page.locator(".story-card")).toHaveCount(4);
  await expect(card(page, "three").locator(".story-image img")).toHaveAttribute(
    "src",
    red,
  );
});
test("individual viewport slides and sidebar slides move between scenes with their timings, selected variants and one-step Undo", async ({
  page,
}) => {
  await open(page);
  await boardButton(page).click();
  await card(page, "one").locator(".story-card-select").click();
  await mouseDrag(
    page,
    card(page, "one").locator(".story-card-slide").first(),
    card(page, "two").locator(".story-card-select"),
  );
  await expect(card(page, "one").locator(".story-card-slide")).toHaveCount(1);
  await card(page, "two").locator(".story-card-select").click();
  await info(page);
  await expect(
    panel(page).locator(".story-frame-slot[data-frame]"),
  ).toHaveCount(2);
  await expect(panel(page).locator('[data-frame="r"] img')).toHaveAttribute(
    "src",
    red,
  );
  await panel(page).locator('[data-frame="r"]').click();
  await expect(
    panel(page).getByLabel("Длительность, секунды", { exact: true }),
  ).toHaveValue("0.3");
  await page.keyboard.press("Control+z");
  await expect(
    panel(page).locator(".story-frame-slot[data-frame]"),
  ).toHaveCount(1);
  await panel(page)
    .getByLabel("Вариант сцены 2", { exact: true })
    .selectOption("B");
  await card(page, "one").locator(".story-card-select").click();
  await info(page);
  await mouseDrag(
    page,
    panel(page).locator('[data-frame="b"]'),
    card(page, "two").locator(".story-card-select"),
  );
  await expect(panel(page).locator('[data-frame="b"]')).toHaveCount(0);
  await card(page, "two").locator(".story-card-select").click();
  await info(page);
  await expect(panel(page).locator('[data-frame="b"] img')).toHaveAttribute(
    "src",
    blue,
  );
  await expect(
    panel(page).getByLabel("Длительность, секунды", { exact: true }),
  ).toHaveValue("0.7");
  await panel(page)
    .getByLabel("Вариант сцены 2", { exact: true })
    .selectOption("A");
  await expect(panel(page).locator('[data-frame="g"] img')).toHaveAttribute(
    "src",
    green,
  );
  await expect(panel(page).locator('[data-frame="b"]')).toHaveCount(0);
  await panel(page)
    .getByLabel("Сцена для переноса слайда", { exact: true })
    .selectOption("three");
  await panel(page)
    .getByRole("button", { name: "Переместить слайд", exact: true })
    .click();
  await expect(
    panel(page).locator(".story-frame-slot[data-frame]"),
  ).toHaveCount(0);
  await expect(card(page, "three").locator(".story-image img")).toHaveAttribute(
    "src",
    green,
  );
});

async function pasteUrl(page, text, url) {
  await page.locator(".screenplay-editor").evaluate(
    (element, { text, url }) => {
      const editor = element.editor;
      let from;
      editor.state.doc.descendants((node, pos) => {
        if (from === undefined && node.isText && node.text.includes(text))
          from = pos + node.text.indexOf(text);
      });
      if (from === undefined) throw new Error("Selection text not found");
      editor
        .chain()
        .focus()
        .setTextSelection({ from, to: from + text.length })
        .run();
      const clipboardData = new DataTransfer();
      clipboardData.setData("text/plain", url);
      element.dispatchEvent(
        new ClipboardEvent("paste", {
          bubbles: true,
          cancelable: true,
          clipboardData,
        }),
      );
    },
    { text, url },
  );
}
for (const theme of ["light", "dark"])
  test(`${theme}: URL paste creates ordinary links without components; hover is stable and displays the complete address`, async ({
    page,
  }, info) => {
    await open(page, { theme });
    const original = await page.locator(".screenplay-editor").textContent();
    const url =
      "https://example.com/" + "research/".repeat(25) + "?full=address";
    await pasteUrl(page, "ПЯТАЧОК", url);
    await expect(page.locator(".component-editor")).toHaveCount(0);
    const link = page.locator(".script-text-link").first();
    await expect(link).toHaveAttribute("href", url);
    await page.mouse.move(20, 70);
    const background = await link.evaluate(
      (e) => getComputedStyle(e).backgroundColor,
    );
    expect(background).toMatch(/0\.08/);
    await link.hover();
    await expect(link).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    const action = page.locator(".component-hover-link"),
      panel = page.locator(".component-link-hover");
    await expect(action).toBeVisible();
    const initial = await panel.boundingBox(),
      text = await link.boundingBox();
    await page.mouse.move(text.x + text.width - 2, text.y + text.height / 2);
    expect(await panel.boundingBox()).toEqual(initial);
    // Move diagonally through the safe triangle rather than teleporting to the icon.
    await page.mouse.move(initial.x + 30, initial.y + 30, { steps: 10 });
    await expect(action).toBeVisible();
    await expect(page.locator(".text-link-address")).toHaveText(url);
    expect(
      (await page.locator(".text-link-address").boundingBox()).width,
    ).toBeLessThanOrEqual(280);
    await page.screenshot({
      path: info.outputPath(`ordinary-link-${theme}.png`),
    });
    await pasteUrl(page, "Тихая комната.", "https://example.com/room");
    await expect(page.locator(".script-text-link")).toHaveCount(2);
    await page.keyboard.press("Control+z");
    await expect(page.locator(".script-text-link")).toHaveCount(1);
    await page.keyboard.press("Control+Shift+z");
    await expect(page.locator(".script-text-link")).toHaveCount(2);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            new Promise((resolve) => {
              const open = indexedDB.open("tyter.local-files.v1", 1);
              open.onsuccess = () => {
                const database = open.result;
                const read = database
                  .transaction("files")
                  .objectStore("files")
                  .get("documents");
                read.onsuccess = () => {
                  const doc = read.result?.find(
                    (doc) => doc.id === "storyboard-test",
                  );
                  resolve({
                    links: (
                      JSON.stringify(doc?.content).match(/"type":"link"/g) || []
                    ).length,
                    components: doc?.components.length,
                  });
                  database.close();
                };
              };
            }),
        ),
      )
      .toEqual({ links: 2, components: 1 });
    await page.reload();
    await expect(page.locator(".script-text-link")).toHaveCount(2);
    expect(await page.locator(".screenplay-editor").textContent()).toBe(
      original,
    );
    await expect(
      page.locator('.workspace-tools button[aria-label="Компоненты"]'),
    ).toHaveText("1");
  });

test("English context menu pastes an ordinary URL without opening component settings on mobile", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page, { language: "en" });
  await page.evaluate(() =>
    navigator.clipboard.writeText("https://example.com/dialogue"),
  );
  await page.locator(".screenplay-editor").evaluate((element) => {
    element.editor.state.doc.descendants((node, pos) => {
      if (node.attrs?.blockId === "speech")
        element.editor
          .chain()
          .focus()
          .setTextSelection({ from: pos + 1, to: pos + 1 + node.content.size })
          .run();
    });
  });
  await page.locator('[data-block-id="speech"]').click({ button: "right" });
  await page.getByRole("menuitem", { name: /^Paste/ }).click();
  await expect(page.locator(".script-text-link")).toHaveAttribute(
    "href",
    "https://example.com/dialogue",
  );
  await expect(page.locator(".component-editor")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".script-text-link")).toBeVisible();
});

test("desktop mouse reorders scenes and actual text blocks; Escape cancels and compact structure is shared", async ({
  page,
}) => {
  await open(page);
  await boardButton(page).click();
  await expect(
    page.locator('.storyboard-workspace input[type="search"], .story-search'),
  ).toHaveCount(0);
  await mouseDrag(page, card(page, "three"), card(page, "one"));
  await expect(page.locator(".story-card").first()).toHaveAttribute(
    "data-scene",
    "three",
  );
  await mouseDrag(page, card(page, "three"), card(page, "two"), true);
  await expect(page.locator(".story-card").first()).toHaveAttribute(
    "data-scene",
    "three",
  );
  await mouseDrag(page, card(page, "three"), card(page, "two"));
  await expect(page.locator(".story-card").last()).toHaveAttribute(
    "data-scene",
    "three",
  );
  await card(page, "one").getByRole("button").click();
  await expect(panel(page).locator("textarea:visible")).toHaveCount(0);
  const block = (id) =>
    panel(page).locator(`.story-structure-block[data-block="${id}"]`);
  await mouseDrag(
    page,
    block("speech").getByRole("button", {
      name: "Переместить блок",
      exact: true,
    }),
    block("action-one"),
  );
  await expect(
    panel(page).locator(".story-block-row:visible").first(),
  ).toContainText("Диалог");
  await panel(page)
    .getByRole("button", { name: "Диалог", exact: true })
    .click();
  await expect(
    panel(page).getByRole("textbox", { name: "Диалог 2", exact: true }),
  ).toHaveValue("Ты слышишь это?");
  await panel(page)
    .getByRole("button", { name: "Вернуться к сценарию", exact: true })
    .click();
  const order = await page
    .locator(".screenplay-editor")
    .evaluate((e) => e.editor.getJSON().content.map((p) => p.attrs.blockId));
  expect(order.slice(0, 4)).toEqual([
    "one",
    "speech",
    "action-one",
    "character",
  ]);
  await expect(
    panel(page).getByRole("textbox", { name: "Диалог 2", exact: true }),
  ).toHaveValue("Ты слышишь это?");
  await page.screenshot({ path: ".cache/storyboard-compact-screenplay.png" });
});
test("page play runs filled frames in scene order, pauses, navigates, restarts and closes", async ({
  page,
}) => {
  await open(page);
  await boardButton(page).click();
  await page.clock.install();
  const play = page.getByRole("button", {
    name: "Воспроизвести страницу 1",
    exact: true,
  });
  await play.click();
  const player = page.getByRole("dialog", {
    name: "Проигрыватель страницы 1",
    exact: true,
  });
  const img = player.locator("img");
  await expect(img).toHaveAttribute("src", red);
  await page.clock.runFor(301);
  await expect(img).toHaveAttribute("src", blue);
  await player
    .getByRole("button", { name: "Приостановить воспроизведение", exact: true })
    .click();
  await page.clock.runFor(2000);
  await expect(img).toHaveAttribute("src", blue);
  await player
    .getByRole("button", { name: "Следующий кадр", exact: true })
    .click();
  await expect(img).toHaveAttribute("src", green);
  await expect(player.locator("output")).toHaveText("3 / 3");
  await player
    .getByRole("button", { name: "Продолжить воспроизведение", exact: true })
    .click();
  await expect(img).toHaveAttribute("src", red);
  await page.clock.runFor(1001);
  await expect(img).toHaveAttribute("src", green);
  await page.clock.runFor(5001);
  await expect(
    player.getByRole("button", {
      name: "Продолжить воспроизведение",
      exact: true,
    }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(player).toHaveCount(0);
  await play.click();
  await expect(img).toHaveAttribute("src", red);
  await player
    .getByRole("button", { name: "Закрыть проигрыватель", exact: true })
    .click();
  await expect(player).toHaveCount(0);
});

async function generator(page) {
  await boardButton(page).click();
  await card(page, "one").getByRole("button").click();
  await info(page);
  await panel(page)
    .getByRole("button", { name: "Создать кадры по описанию", exact: true })
    .click();
  await panel(page)
    .getByLabel("Количество кадров", { exact: true })
    .selectOption("2");
  return panel(page).locator(".story-generator");
}
test("generation previews a reviewed description and fills empty slots without replacing existing frames; Undo and reload retain data", async ({
  page,
}) => {
  let submits = 0,
    request;
  await page.route("https://aihorde.net/api/v2/**", async (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      submits++;
      request = req.postDataJSON();
      return route.fulfill({ json: { id: "browser-test-12345" } });
    }
    if (req.url().includes("/check/"))
      return route.fulfill({ json: { done: true, finished: 2 } });
    return route.fulfill({
      json: { generations: [{ img: green }, { img: blue }] },
    });
  });
  await open(page);
  const form = await generator(page);
  await expect(
    form.getByLabel("Описание для генерации", { exact: true }),
  ).toHaveValue("ЭКС. ХОЛМ — ДЕНЬ\nДва кролика встречаются на холме.");
  expect(submits).toBe(0);
  await form
    .getByLabel("Описание для генерации", { exact: true })
    .fill("Два кролика смотрят на восход.");
  await form
    .getByRole("button", { name: "Сгенерировать 2 кадра", exact: true })
    .click();
  await expect(
    form.getByRole("img", { name: "Сгенерированный кадр 1", exact: true }),
  ).toBeVisible();
  expect(submits).toBe(1);
  expect(request.prompt).toContain("Два кролика смотрят на восход.");
  expect(request.prompt).not.toContain("Ты слышишь это");
  await form
    .getByRole("button", { name: "Добавить выбранные кадры (2)", exact: true })
    .click();
  await expect(
    panel(page).locator(".story-frame-slot[data-frame]"),
  ).toHaveCount(4);
  await expect(panel(page).locator('[data-frame="r"] img')).toHaveAttribute(
    "src",
    red,
  );
  await expect(panel(page).locator('[data-frame="b"] img')).toHaveAttribute(
    "src",
    blue,
  );
  await expect(panel(page).locator('[data-frame="empty"] img')).toHaveAttribute(
    "src",
    green,
  );
  await page.keyboard.press("Control+z");
  await expect(
    panel(page).locator(".story-frame-slot[data-frame]"),
  ).toHaveCount(3);
  await expect(panel(page).locator('[data-frame="empty"] img')).toHaveCount(0);
  await page.keyboard.press("Control+Shift+z");
  await expect(
    panel(page).locator(".story-frame-slot[data-frame]"),
  ).toHaveCount(4);
  await page.waitForTimeout(700);
  await page.reload();
  await boardButton(page).click();
  await card(page, "one").getByRole("button").click();
  await info(page);
  await expect(panel(page).locator('[data-frame="empty"] img')).toHaveAttribute(
    "src",
    green,
  );
});
test("generation cancels accepted jobs and reports provider limits without changing slides", async ({
  page,
}) => {
  let deleted = 0,
    blocked = false;
  await page.route("https://aihorde.net/api/v2/**", async (route) => {
    const req = route.request();
    if (req.method() === "POST")
      return route.fulfill({
        status: blocked ? 429 : 200,
        json: blocked ? {} : { id: "cancel-test-12345" },
      });
    if (req.method() === "DELETE") {
      deleted++;
      return route.fulfill({ json: {} });
    }
    return route.fulfill({ json: { done: false, wait_time: 70 } });
  });
  await open(page);
  const form = await generator(page);
  await form
    .getByRole("button", { name: "Сгенерировать 2 кадра", exact: true })
    .click();
  await expect(form.getByRole("status")).toContainText("бесплатной очереди");
  await form
    .getByRole("button", { name: "Отменить генерацию", exact: true })
    .click();
  await expect.poll(() => deleted).toBe(1);
  await expect(form.getByRole("status")).toHaveCount(0);
  blocked = true;
  await form
    .getByRole("button", { name: "Сгенерировать 2 кадра", exact: true })
    .click();
  await expect(form.getByRole("alert")).toContainText("много запросов");
  await expect(
    panel(page).locator(".story-frame-slot[data-frame]"),
  ).toHaveCount(3);
  blocked = false;
  await form
    .getByRole("button", { name: "Сгенерировать 2 кадра", exact: true })
    .click();
  await expect(form.getByRole("status")).toContainText("бесплатной очереди");
  await panel(page)
    .getByLabel("Вариант сцены 1", { exact: true })
    .selectOption("B");
  await expect.poll(() => deleted).toBe(2);
  await expect(
    panel(page).locator(".story-frame-slot[data-frame]"),
  ).toHaveCount(0);
});

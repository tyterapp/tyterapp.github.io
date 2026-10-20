import { test, expect } from "@playwright/test";
import { createCanvas } from "@napi-rs/canvas";
import fs from "node:fs/promises";
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
    await panel(page).getByLabel("Драматичность", { exact: true }).fill("0");
    await panel(page)
      .getByLabel("Описание сцены", { exact: true })
      .fill("Начало приключения.");
    await panel(page)
      .getByRole("button", { name: "График драматургии", exact: true })
      .click();
    await expect(
      panel(page).getByRole("group", { name: "Драматичность сцен от 0 до 10" }),
    ).toBeVisible();
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
    await page.waitForTimeout(700);
    await page.reload();
    await boardButton(page).click();
    await card(page, "one").getByRole("button").click();
    await info(page, true);
    await expect(
      panel(page).getByLabel("Описание сцены", { exact: true }),
    ).toHaveValue("Начало приключения.");
    await expect(
      panel(page).getByLabel("Драматичность", { exact: true }),
    ).toHaveValue("0");
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
      `scene-001-A_frame-002.${format.toLowerCase()}`,
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
  test(`${theme}: URL paste links an existing component and creates one for plain text; backing is blue at 8% and disappears on hover`, async ({
    page,
  }) => {
    await open(page, { theme });
    const original = await page.locator(".screenplay-editor").textContent();
    await pasteUrl(page, "ПЯТАЧОК", "https://example.com/rabbit");
    const form = page.locator(".component-editor");
    await expect(
      form.getByLabel("Ссылка компонента", { exact: true }),
    ).toHaveValue("https://example.com/rabbit");
    await pasteUrl(page, "ПЯТАЧОК", "https://example.com/rabbit-updated");
    await expect(
      form.getByLabel("Ссылка компонента", { exact: true }),
    ).toHaveValue("https://example.com/rabbit-updated");
    const mark = page
      .locator(".screenplay-editor .script-component-url")
      .filter({ hasText: "ПЯТАЧОК" })
      .first();
    await page.mouse.move(20, 70);
    await expect
      .poll(() => mark.evaluate((e) => getComputedStyle(e).backgroundColor))
      .toBe("rgba(27, 46, 255, 0.08)");
    await mark.hover();
    await expect
      .poll(() => mark.evaluate((e) => getComputedStyle(e).backgroundColor))
      .toBe("rgba(0, 0, 0, 0)");
    await form
      .getByLabel("Использовать ссылку компонента", { exact: true })
      .uncheck();
    await form.getByRole("button", { name: "Сохранить", exact: true }).click();
    await expect(page.locator(".script-component-url")).toHaveCount(0);
    await expect(
      page.locator('.screenplay-editor [data-entity-id="rabbit"]'),
    ).toBeVisible();
    await pasteUrl(page, "Тихая комната.", "https://example.com/room");
    await expect(
      form.getByLabel("Ссылка компонента", { exact: true }),
    ).toHaveValue("https://example.com/room");
    await expect(
      page
        .locator(".script-component-url")
        .filter({ hasText: "Тихая комната." }),
    ).toBeVisible();
    expect(await page.locator(".screenplay-editor").textContent()).toBe(
      original,
    );
    await page
      .locator(".screenplay-editor")
      .click({ position: { x: 250, y: 150 } });
    await page.keyboard.press("Control+z");
    await expect(page.locator(".script-component-url")).toHaveCount(0);
    await page.keyboard.press("Control+Shift+z");
    await expect(
      page
        .locator(".script-component-url")
        .filter({ hasText: "Тихая комната." }),
    ).toBeVisible();
    await page.screenshot({ path: `.cache/component-link-${theme}.png` });
    await page.waitForTimeout(700);
    await page.reload();
    await expect(
      page
        .locator(".script-component-url")
        .filter({ hasText: "Тихая комната." }),
    ).toBeVisible();
    expect(await page.locator(".screenplay-editor").textContent()).toBe(
      original,
    );
  });

test("English context menu pastes a URL as a component link and mobile settings keep the independent switch", async ({
  page,
  context,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page, { language: "en" });
  await page.evaluate(() =>
    navigator.clipboard.writeText("https://example.com/dialogue"),
  );
  await page.locator(".screenplay-editor").evaluate((element) => {
    const editor = element.editor;
    let from, to;
    editor.state.doc.descendants((node, pos) => {
      if (node.attrs?.blockId === "speech") {
        from = pos + 1;
        to = from + node.content.size;
      }
    });
    editor.chain().focus().setTextSelection({ from, to }).run();
  });
  await page.locator('[data-block-id="speech"]').click({ button: "right" });
  expect(errors).toEqual([]);
  await expect(page.getByRole("menu", { name: "Text actions" })).toBeVisible();
  await page.getByRole("menuitem", { name: /^Paste/ }).click();
  const form = page.locator(".component-editor");
  await expect(form.getByLabel("Component link", { exact: true })).toHaveValue(
    "https://example.com/dialogue",
  );
  await expect(
    page
      .locator(".script-component-url")
      .filter({ hasText: "Ты слышишь это?" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    form.getByLabel("Enable component link", { exact: true }),
  ).toBeVisible();
  const size = await form
    .getByLabel("Component link", { exact: true })
    .evaluate((e) => getComputedStyle(e).fontSize);
  expect(parseFloat(size)).toBeGreaterThanOrEqual(16);
  await page.screenshot({ path: ".cache/component-link-mobile.png" });
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

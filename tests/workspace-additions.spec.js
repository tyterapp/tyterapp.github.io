import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { createProject, validateImport } from "../src/data.js";
import { dailyVisit } from "../src/daily-streak.js";
import { typewriterSample } from "../src/typewriter-audio.js";
import { switchScriptVersion } from "../src/script-versions.js";
import { grantPro } from "./helpers/pro-access.js";

test.use({ timezoneId: "Europe/Moscow" });
const p = (format, text, blockId) => ({
  type: "paragraph",
  attrs: { format, blockId },
  content: [{ type: "text", text }],
});
function fixture(errors = 0) {
  const doc = createProject("Заметки и награды");
  doc.id = "workspace-additions";
  doc.content.content = [
    p("scene", errors === 1 ? "ИНТ. ДОМ" : "ИНТ. ДОМ — ДЕНЬ", "scene"),
    p("action", "Исходный сценарий сохранён.", "action"),
  ];
  if (errors > 1)
    doc.content.content = Array.from({ length: 20 }, (_, i) => [
      p("scene", `МЕСТО ${i}`, `s${i}`),
      p("action", `Действие ${i}`, `a${i}`),
    ]).flat();
  doc.notes = {
    content: {
      type: "doc",
      content: [p("plain", "Белые заметки. Другая идея.", "note")],
    },
    comments: [],
  };
  doc.components = [
    { id: "hero", name: "Анна", type: "character", description: "Героиня" },
  ];
  return doc;
}
async function open(
  page,
  { pro = true, theme = "light", errors = 0, width = 1440 } = {},
) {
  await page.setViewportSize({ width, height: width < 832 ? 844 : 1000 });
  if (pro) await grantPro(page);
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  await page.addInitScript(
    ({ doc, theme }) => {
      localStorage.setItem("tyter.onboarding.v1", "done");
      if (sessionStorage.getItem("additions-seeded")) return;
      localStorage.setItem("tyter.projects.v1", JSON.stringify([doc]));
      localStorage.setItem("tyter.active", doc.id);
      localStorage.setItem("tyter.language.v1", "ru");
      localStorage.setItem(
        "tyter.editor-preferences.v1",
        JSON.stringify({ theme }),
      );
      sessionStorage.setItem("additions-seeded", "yes");
    },
    { doc: fixture(errors), theme },
  );
  await page.goto(pro ? "/beta" : "/free");
  await page.bringToFront();
  await expect(page.locator(".screenplay-editor")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  if (pro)
    await expect
      .poll(async () => (await stored(page))?.id)
      .toBe("workspace-additions");
}
const wallet = (page) =>
  page.evaluate(() =>
    JSON.parse(localStorage.getItem("tyter.writing-timer.v1")),
  );
const stored = (page) =>
  page.evaluate(async () =>
    (
      await (await import("/src/browser-files.js")).browserRequest("documents")
    ).documents.find((doc) => doc.id === "workspace-additions"),
  );
const picker = (page) =>
  page.getByRole("combobox", { name: "Версии сценария", exact: true });
async function notes(page, label = "v1 White") {
  await picker(page).click();
  await page
    .getByRole("button", { name: `Заметки ${label}`, exact: true })
    .click();
  await expect(page.locator(".notes-paper")).toBeVisible();
}
async function selectParagraph(page, selector) {
  await page.locator(selector).evaluate((node) => {
    node.closest("[contenteditable]").focus();
    const range = document.createRange();
    range.selectNodeContents(node);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
}
test("daily visit counts local dates, bonuses each fifth day, gaps, leap days and repeat visits", () => {
  let state = { coins: 0, session: null };
  for (let day = 1; day <= 10; day++) {
    const now = new Date(
      `2026-10-${String(day).padStart(2, "0")}T09:00:00+03:00`,
    ).getTime();
    const result = dailyVisit(state, now);
    state = result.wallet;
    expect(result.reward).toBe(day % 5 === 0 ? 11 : 1);
    expect(state.streak.count).toBe(day);
    expect(dailyVisit(state, now).reward).toBe(0);
  }
  expect(state.coins).toBe(30);
  expect(dailyVisit(state, new Date("2026-10-09T09:00:00+03:00")).reward).toBe(
    0,
  );
  state = dailyVisit(state, new Date("2026-10-12T09:00:00+03:00")).wallet;
  expect(state.streak).toEqual({ day: "2026-10-12", count: 1, best: 10 });
  expect(
    dailyVisit(
      { coins: 3, streak: { day: "2028-02-29", count: 4 } },
      new Date("2028-03-01T12:00:00Z"),
    ).reward,
  ).toBe(11);
});
test("daily login awards once across tabs and reload; fifth day adds bonus", async ({
  page,
  context,
}) => {
  await page.clock.install({ time: new Date("2026-10-10T09:00:00Z") });
  await open(page, { pro: false });
  await expect.poll(async () => (await wallet(page))?.coins).toBe(1);
  const second = await context.newPage();
  await second.goto("/free");
  await expect.poll(async () => (await wallet(second))?.coins).toBe(1);
  await second.close();
  await page.bringToFront();
  await page.reload();
  expect((await wallet(page)).coins).toBe(1);
  for (let day = 11; day <= 14; day++) {
    await page.clock.setSystemTime(new Date(`2026-10-${day}T09:00:00Z`));
    await page.reload();
    await expect
      .poll(async () => (await wallet(page))?.streak.count)
      .toBe(day - 9);
  }
  expect((await wallet(page)).coins).toBe(15);
  await expect(page.locator(".app-message")).toContainText("Стрик: 5 дней");
  await page.clock.setSystemTime(new Date("2026-10-16T09:00:00Z"));
  await page.reload();
  await expect.poll(async () => (await wallet(page))?.streak.count).toBe(1);
  expect((await wallet(page)).coins).toBe(16);
});
test("midnight grants the next visit and Go is inert; notification fades after five seconds", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-10T20:59:30Z") });
  await open(page, { pro: false });
  await page.clock.pauseAt(
    new Date((await page.evaluate(() => Date.now())) + 250),
  );
  await page.clock.setSystemTime(new Date("2026-10-10T20:59:56Z"));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.clock.runFor(4300);
  await expect.poll(async () => (await wallet(page))?.streak.count).toBe(2);
  expect((await wallet(page)).coins).toBe(2);
  const url = page.url();
  const go = page
    .locator(".app-message")
    .getByRole("button", { name: "Перейти" });
  await go.click();
  expect(page.url()).toBe(url);
  await expect(page.locator(".app-message")).toHaveCSS("color", "oklch(0 0 0)");
  await page.clock.runFor(5000);
  await expect(page.locator(".app-message")).toHaveClass(/is-closing/);
  await page.clock.runFor(250);
  await expect(page.locator(".app-message")).toHaveCount(0);
});
test("all 48 physical keys map to actual attached MP3 samples, including Russian/mobile input", () => {
  const codes = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"]
    .map((key) => `Key${key}`)
    .concat(
      [..."0123456789"].map((key) => `Digit${key}`),
      [
        "Space",
        "Enter",
        "Backspace",
        "Delete",
        "Comma",
        "Period",
        "Semicolon",
        "Quote",
        "BracketLeft",
        "BracketRight",
        "Minus",
        "Equal",
      ],
    );
  const samples = codes.map((code) => typewriterSample({ code }));
  expect(new Set(samples).size).toBe(48);
  for (const sample of samples)
    expect(fs.statSync(`public${sample}`).size).toBeGreaterThan(1000);
  expect(typewriterSample({ key: "ф" })).toBe(
    typewriterSample({ code: "KeyA" }),
  );
  expect(typewriterSample({ key: "3" })).toBe(
    typewriterSample({ code: "Digit3" }),
  );
  expect(typewriterSample({ key: "Shift", code: "ShiftLeft" })).toBeNull();
});
test("enabled typewriter decodes recorded audio and uses different samples for different keys", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.audioStarts = [];
    const Context = window.AudioContext;
    window.AudioContext = class extends Context {
      createBufferSource() {
        const source = super.createBufferSource(),
          start = source.start.bind(source);
        source.start = (...args) => {
          window.audioStarts.push({
            duration: source.buffer.duration,
            value: source.buffer
              .getChannelData(0)
              .slice(0, 200)
              .reduce((sum, value) => sum + value, 0),
          });
          return start(...args);
        };
        return source;
      }
    };
  });
  await open(page, { pro: false });
  await page.locator('[data-block-id="action"]').click();
  await page.keyboard.press("a");
  expect(await page.evaluate(() => window.audioStarts.length)).toBe(0);
  await page
    .getByRole("button", { name: "Настройки документа", exact: true })
    .click();
  await page.getByLabel("Звук печатной машинки").check();
  await page.keyboard.press("Escape");
  await page.locator('[data-block-id="action"]').click();
  await page.keyboard.press("a");
  await expect
    .poll(() => page.evaluate(() => window.audioStarts.length))
    .toBe(1);
  await page.keyboard.press("b");
  await expect
    .poll(() => page.evaluate(() => window.audioStarts.length))
    .toBe(2);
  const samples = await page.evaluate(() => window.audioStarts);
  expect(samples[0].duration).toBeGreaterThan(0);
  expect(samples[0]).not.toEqual(samples[1]);
  await page.locator(".screenplay-editor").evaluate((node) =>
    node.dispatchEvent(
      new InputEvent("beforeinput", {
        bubbles: true,
        inputType: "insertText",
        data: "ф",
      }),
    ),
  );
  await expect
    .poll(() => page.evaluate(() => window.audioStarts.length))
    .toBe(3);
});
test("notes import/export strip text formatting and stay isolated per screenplay version", () => {
  const white = fixture();
  white.notes.content.content[0].content[0].marks = [{ type: "bold" }];
  const clean = validateImport(white);
  expect(clean.notes.content.content[0].content[0].marks).toEqual([]);
  let blue = switchScriptVersion(clean, "blue");
  blue.notes.content.content[0].content[0].text = "Синяя заметка";
  const back = validateImport(switchScriptVersion(blue, "white"));
  expect(back.notes.content.content[0].content[0].text).toContain(
    "Белые заметки",
  );
  expect(
    back.scriptVersions.blue.notes.content.content[0].content[0].text,
  ).toBe("Синяя заметка");
});
test("notes editor uses Inter 18px, disables formatting, supports search/comments, saves and exports all versions", async ({
  page,
}, info) => {
  await open(page);
  await notes(page);
  const editor = page.locator(".screenplay-editor");
  await expect(editor).toHaveCSS("font-size", "18px");
  await expect(editor).toHaveCSS("font-family", /Inter/);
  await selectParagraph(page, '[data-block-id="note"]');
  await page.keyboard.press("Control+b");
  await page.keyboard.press("Control+1");
  await page.keyboard.insertText("Белая идея о кошке.");
  await expect(editor.locator("b,strong,i,em,u")).toHaveCount(0);
  await expect(editor.locator("p")).toHaveAttribute("data-format", "plain");
  await page
    .getByRole("button", { name: "Поиск в заметках", exact: true })
    .click();
  await page.getByLabel("Поиск по тексту").fill("кошке");
  await expect(page.locator(".search-result-card")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Закрыть поиск", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Комментарии к заметкам", exact: true })
    .click();
  await page.locator(".comments-drawer textarea").fill("Проверить идею");
  await page
    .locator(".comments-drawer")
    .getByRole("button", { name: "Добавить", exact: true })
    .click();
  await expect(page.locator(".comment-card")).toContainText("Проверить идею");
  await page
    .getByRole("button", { name: "Закрыть комментарии", exact: true })
    .click();
  await expect
    .poll(async () => (await stored(page)).notes.comments.length)
    .toBe(1);
  await notes(page, "v2 Blue");
  await selectParagraph(page, '[data-block-id="note"]');
  await page.keyboard.insertText("Синяя заметка.");
  await notes(page);
  await expect(editor).toContainText("Белая идея о кошке.");
  await page
    .getByRole("button", { name: "Вернуться к сценарию", exact: true })
    .click();
  await expect(editor).toContainText("Исходный сценарий сохранён.");
  await page.reload();
  await notes(page);
  await expect(editor).toContainText("Белая идея о кошке.");
  await page.screenshot({ path: info.outputPath("notes-desktop.png") });
  await page
    .getByRole("button", { name: "Скачать сценарий", exact: true })
    .click();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: /Проект Tyter · TYT/ }).click();
  const stream = await (await downloaded).createReadStream();
  let bytes = "";
  for await (const chunk of stream) bytes += chunk;
  const exported = validateImport(JSON.parse(bytes).document);
  expect(exported.notes.comments).toHaveLength(1);
  expect(
    exported.scriptVersions.blue.notes.content.content[0].content[0].text,
  ).toBe("Синяя заметка.");
  expect(exported.content.content[1].content[0].text).toBe(
    "Исходный сценарий сохранён.",
  );
});
test("notes fit 320px, search opens a sheet, and components remain available", async ({
  page,
}, info) => {
  await open(page, { width: 320, theme: "dark" });
  await notes(page);
  const paper = await page.locator(".notes-paper").boundingBox();
  expect(paper.x).toBeGreaterThanOrEqual(0);
  expect(paper.x + paper.width).toBeLessThanOrEqual(320);
  await expect(page.locator(".screenplay-editor")).toHaveCSS(
    "font-size",
    "18px",
  );
  await page
    .getByRole("button", { name: "Поиск в заметках", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Заметки", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Поиск по тексту").fill("Белые");
  await expect(page.locator(".search-result-card")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Закрыть поиск", exact: true })
    .click();
  await page.locator(".mobile-components-toggle").click();
  await expect(page.locator(".components-drawer")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".notes-paper")).toBeVisible();
  await page.screenshot({ path: info.outputPath("notes-mobile.png") });
});

test("rich paste into notes stays plain and creating a component does not change the screenplay", async ({
  page,
}) => {
  await open(page, { errors: 1 });
  await notes(page);
  await selectParagraph(page, '[data-block-id="note"]');
  await page.locator(".screenplay-editor").evaluate((node) => {
    const data = new DataTransfer();
    data.setData(
      "text/html",
      '<p data-format="character"><strong><em><u>Новая идея</u></em></strong></p>',
    );
    data.setData("text/plain", "Новая идея");
    node.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await expect(page.locator(".notes-paper p[data-format=plain]")).toContainText(
    "Новая идея",
  );
  await expect(
    page.locator(
      ".notes-paper b, .notes-paper strong, .notes-paper i, .notes-paper em, .notes-paper u",
    ),
  ).toHaveCount(0);
  await selectParagraph(page, '.notes-paper p[data-format="plain"]');
  await page.keyboard.press("Control+d");
  await expect
    .poll(async () =>
      (await stored(page)).components.some(
        (component) => component.name === "Новая идея",
      ),
    )
    .toBe(true);
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Доктор сценария", exact: true })
    .click();
  await expect(page.locator(".notes-paper")).toHaveCount(0);
  await page.locator(".doctor-finding").first().click();
  await expect(page.locator('[data-block-id="action"]')).toContainText(
    "Исходный сценарий сохранён.",
  );
  expect(JSON.stringify((await stored(page)).content)).not.toContain(
    "Новая идея",
  );
  await notes(page);
  await expect(page.locator(".screenplay-editor")).toContainText("Новая идея");
});

test("restoring notes history preserves the current screenplay and outline", async ({
  page,
}) => {
  await open(page);
  await page.evaluate(async () => {
    const { browserRequest } = await import("/src/browser-files.js");
    const { snapshotOf, recordRevision } = await import("/src/history.js");
    const doc = (await browserRequest("documents")).documents.find(
      (doc) => doc.id === "workspace-additions",
    );
    const snapshot = snapshotOf(doc);
    snapshot.content.content[1].content[0].text = "Старая редакция сценария";
    await recordRevision(
      doc.id,
      snapshot,
      "тестовых заметок",
      Infinity,
      "screenplay",
    );
  });
  await notes(page);
  await selectParagraph(page, '[data-block-id="note"]');
  await page.keyboard.insertText("Новые заметки.");
  await page
    .getByRole("button", { name: "История изменений", exact: true })
    .click();
  await page
    .locator(".history-card")
    .filter({ hasText: "До изменения тестовых заметок" })
    .click();
  await expect(page.locator(".history-preview-content")).toContainText(
    "Белые заметки",
  );
  await expect(page.locator(".history-preview-content")).not.toContainText(
    "Старая редакция сценария",
  );
  await page
    .getByRole("button", { name: "Восстановить эту версию", exact: true })
    .click();
  await expect(page.locator(".screenplay-editor")).toContainText(
    "Белые заметки",
  );
  await expect
    .poll(async () => JSON.stringify((await stored(page)).content))
    .toContain("Исходный сценарий сохранён.");
  expect(JSON.stringify((await stored(page)).content)).not.toContain(
    "Старая редакция сценария",
  );
});
for (const errors of [1, 40])
  test(`doctor shows exactly ${Math.min(12, errors)} subtle SVG flies, never intercepting clicks`, async ({
    page,
  }) => {
    await open(page, { pro: false, errors });
    const flies = page.locator(".doctor-fly.is-visible, .doctor-interface-fly");
    await expect(flies).toHaveCount(Math.min(12, errors));
    await expect(page.locator(".doctor-interface-flies")).toHaveCSS(
      "pointer-events",
      "none",
    );
    await page
      .getByRole("button", { name: "Доктор сценария", exact: true })
      .click();
    await expect(page.locator(".doctor-drawer")).toBeVisible();
    await page
      .getByRole("button", { name: "Закрыть доктора сценария", exact: true })
      .click();
    await expect(flies).toHaveCount(Math.min(12, errors));
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect
      .poll(() =>
        page
          .locator(".doctor-interface-flies")
          .evaluate(
            (node) =>
              node
                .getAnimations({ subtree: true })
                .filter((animation) => animation.playState === "running")
                .length,
          ),
      )
      .toBe(0);
  });
test("dark search fields and shortcut badges have readable matching surfaces", async ({
  page,
}, info) => {
  await open(page, { pro: false, theme: "dark" });
  await page
    .getByRole("button", { name: "Поиск по сценарию", exact: true })
    .click();
  await expect(page.locator(".sidebar-search input")).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  await expect(page.locator(".sidebar-search input")).toHaveCSS(
    "color",
    "rgb(226, 220, 232)",
  );
  await page.keyboard.press("Escape");
  await selectParagraph(page, '[data-block-id="scene"]');
  await page.keyboard.insertText("И");
  await expect(page.locator(".word-suggestions kbd").first()).toBeVisible();
  await expect(page.locator(".word-suggestions kbd").first()).toHaveCSS(
    "color",
    "rgb(226, 220, 232)",
  );
  await page.screenshot({ path: info.outputPath("dark-shortcut.png") });
});

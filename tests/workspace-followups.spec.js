import { test, expect } from "@playwright/test";
import { createProject } from "../src/data.js";
import { grantPro } from "./helpers/pro-access.js";

test.use({ timezoneId: "Europe/Moscow" });
const p = (format, text, blockId) => ({
  type: "paragraph",
  attrs: { format, blockId },
  ...(text ? { content: [{ type: "text", text }] } : {}),
});
async function open(
  page,
  { theme = "light", width = 1440, empty = false } = {},
) {
  await page.setViewportSize({ width, height: width < 832 ? 844 : 1000 });
  await grantPro(page);
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  const doc = createProject("Проверка дополнений");
  doc.id = "workspace-followups";
  doc.content.content = empty
    ? [p("scene", "", "empty-scene")]
    : Array.from({ length: 8 }, (_, i) => [
        p("scene", `МЕСТО ${i}`, `scene-${i}`),
        p("action", `Действие ${i}.`, `action-${i}`),
      ]).flat();
  doc.notes = {
    content: {
      type: "doc",
      content: [p("plain", "Сохранённая заметка.", "note")],
    },
    comments: [],
  };
  await page.addInitScript(
    ({ doc, theme }) => {
      if (sessionStorage.getItem("followups-seeded")) return;
      sessionStorage.setItem("followups-seeded", "yes");
      localStorage.setItem("tyter.projects.v1", JSON.stringify([doc]));
      localStorage.setItem("tyter.active", doc.id);
      localStorage.setItem("tyter.language.v1", "ru");
      localStorage.setItem(
        "tyter.editor-preferences.v1",
        JSON.stringify({ theme }),
      );
      const now = new Date();
      const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      localStorage.setItem(
        "tyter.writing-timer.v1",
        JSON.stringify({
          coins: 37,
          session: null,
          streak: { day, count: 7, best: 12 },
        }),
      );
    },
    { doc, theme },
  );
  await page.goto("/beta");
  await expect(page.locator(".screenplay-editor")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(async () =>
        (
          await (
            await import("/src/browser-files.js")
          ).browserRequest("documents")
        ).documents.some((doc) => doc.id === "workspace-followups"),
      ),
    )
    .toBe(true);
}
const version = (page) =>
  page.getByRole("combobox", { name: "Версии сценария", exact: true });
const doctor = (page) =>
  page.getByRole("button", { name: "Доктор сценария", exact: true });
const allFlies = (page) =>
  page.locator(".doctor-interface-fly, .doctor-fly.is-visible");
async function selectBlock(page, id) {
  await page.locator(`[data-block-id="${id}"]`).evaluate((node) => {
    node.closest("[contenteditable]").focus();
    const range = document.createRange();
    range.selectNodeContents(node);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
  });
}

for (const theme of ["light", "dark"]) {
  test(`${theme}: doctor can disable every fly, remembers the choice and keeps diagnostics`, async ({
    page,
  }, info) => {
    await open(page, { theme });
    await expect(allFlies(page)).toHaveCount(12);
    const errorCount = await page
      .locator(".script-doctor-icon")
      .getAttribute("data-error-count");
    await doctor(page).click();
    const toggle = page.getByRole("checkbox", {
      name: "Показывать мух",
      exact: true,
    });
    await expect(toggle).toBeChecked();
    await toggle.uncheck();
    await expect(allFlies(page)).toHaveCount(0);
    await expect(page.locator(".doctor-interface-flies")).toHaveCount(0);
    await expect(page.locator(".script-doctor-icon")).toHaveAttribute(
      "data-error-count",
      errorCount,
    );
    await expect(page.locator(".doctor-finding").first()).toBeVisible();
    await page.screenshot({
      path: info.outputPath("doctor-without-flies.png"),
    });
    await page.reload();
    await doctor(page).click();
    await expect(toggle).not.toBeChecked();
    await expect(allFlies(page)).toHaveCount(0);
    await toggle.check();
    await expect(allFlies(page)).toHaveCount(12);
  });

  test(`${theme}: streak button matches timer controls and its warning lasts ten seconds`, async ({
    page,
  }, info) => {
    await open(page, { theme });
    const streak = page.getByRole("button", {
      name: "Показать стрик",
      exact: true,
    });
    const timer = page.getByRole("button", {
      name: "Открыть таймер",
      exact: true,
    });
    await expect(streak).toContainText("7");
    const css = (node) => {
      const style = getComputedStyle(node);
      return [
        style.height,
        style.borderRadius,
        style.backgroundColor,
        style.color,
        style.fontSize,
      ];
    };
    expect(await streak.evaluate(css)).toEqual(await timer.evaluate(css));
    await page.clock.install({ time: new Date("2026-10-10T12:00:00Z") });
    await page.clock.pauseAt(new Date("2026-10-10T12:00:01Z"));
    await streak.click();
    const notice = page.getByRole("alert");
    await expect(notice).toContainText("Дней подряд: 7. Рекорд: 12.");
    await page.screenshot({ path: info.outputPath("streak.png") });
    await page.clock.runFor(9999);
    await expect(notice).not.toHaveClass(/is-closing/);
    await streak.click();
    await page.clock.runFor(9999);
    await expect(notice).not.toHaveClass(/is-closing/);
    await page.clock.runFor(1);
    await expect(notice).toHaveClass(/is-closing/);
    await page.clock.runFor(201);
    await expect(notice).toHaveCount(0);
    await expect(streak).toContainText("7");
  });
}

test("empty scene suggestions remain mounted during timer ticks and preserve selection on resize", async ({
  page,
}) => {
  await open(page, { empty: true });
  await page
    .getByRole("button", { name: "Открыть таймер", exact: true })
    .click();
  await page.getByRole("button", { name: "5 мин", exact: true }).click();
  await page.locator('[data-block-id="empty-scene"]').click();
  const popup = page.getByRole("listbox", { name: "Подсказки", exact: true });
  await expect(popup.getByRole("option")).toHaveCount(4);
  await page.keyboard.press("ArrowDown");
  await expect(popup.getByRole("option", { selected: true })).toContainText(
    "ЭКС.",
  );
  await page.evaluate(() => {
    window.suggestionNode = document.querySelector(".word-suggestions");
    window.suggestionRemovals = 0;
    window.suggestionObserver = new MutationObserver((changes) => {
      for (const change of changes)
        for (const node of change.removedNodes)
          if (node === window.suggestionNode) window.suggestionRemovals++;
    });
    window.suggestionObserver.observe(document.body, { childList: true });
  });
  // Covers multiple live timer renders and autosave/decorations, rather than one frame.
  await page.waitForTimeout(2000);
  expect(await page.evaluate(() => window.suggestionRemovals)).toBe(0);
  expect(
    await page.evaluate(
      () =>
        window.suggestionNode === document.querySelector(".word-suggestions"),
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1280, height: 960 });
  await expect(popup.getByRole("option", { selected: true })).toContainText(
    "ЭКС.",
  );
  await page.keyboard.press("Control+Enter");
  // Gutter widgets contain a visible A but are not part of the saved scene text.
  await expect
    .poll(() =>
      page.evaluate(async () =>
        (
          (
            await (
              await import("/src/browser-files.js")
            ).browserRequest("documents")
          ).documents[0].content.content[0].content || []
        )
          .map((node) => node.text || "")
          .join(""),
      ),
    )
    .toBe("ЭКС. ");
  await expect(popup).toHaveCount(0);
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Control+1");
  await expect(popup).toBeVisible();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(700);
  await expect(popup).toHaveCount(0);
  await page.evaluate(() => window.suggestionObserver.disconnect());
});

for (const width of [320, 1440]) {
  test(`${width}px: explicit Note option opens existing plain notes and returns to the current script`, async ({
    page,
  }, info) => {
    await open(page, { width, theme: width === 1440 ? "dark" : "light" });
    await version(page).click();
    const menu = page.getByRole("listbox", {
      name: "Версии сценария",
      exact: true,
    });
    await expect(menu.getByRole("option")).toHaveCount(10);
    const note = menu.getByRole("option", { name: "Note", exact: true });
    await note.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath("note-option.png") });
    await note.click();
    await expect(version(page)).toContainText("Note");
    const editor = page.getByRole("textbox", {
      name: "Редактор заметок",
      exact: true,
    });
    await expect(editor).toHaveCSS("font-family", /Inter/);
    await expect(editor).toHaveCSS("font-size", "18px");
    await expect(editor).toContainText("Сохранённая заметка.");
    await selectBlock(page, "note");
    await page.keyboard.press("Control+b");
    await page.keyboard.press("Control+3");
    await page.keyboard.insertText("Обычная заметка без оформления.");
    await expect(editor.locator("b,strong,i,em,u")).toHaveCount(0);
    await expect(editor.locator("p")).toHaveAttribute("data-format", "plain");
    await expect(page.locator(".screenplay-format-bar")).toHaveCount(0);
    await version(page).click();
    await page.getByRole("option", { name: "v1 White", exact: true }).click();
    await expect(page.locator(".screenplay-editor")).toContainText(
      "Действие 0.",
    );
    await expect(version(page)).toContainText("v1 White");
    await version(page).click();
    await page.getByRole("option", { name: "Note", exact: true }).click();
    await expect(editor).toContainText("Обычная заметка без оформления.");
    await expect
      .poll(() =>
        page.evaluate(
          async () =>
            (
              await (
                await import("/src/browser-files.js")
              ).browserRequest("documents")
            ).documents[0].notes.content.content[0].content[0].text,
        ),
      )
      .toBe("Обычная заметка без оформления.");
    await page.reload();
    await version(page).click();
    await page.getByRole("option", { name: "Note", exact: true }).click();
    await expect(editor).toContainText("Обычная заметка без оформления.");
  });
}

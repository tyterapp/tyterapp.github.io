import { test, expect } from "@playwright/test";
import { createProject } from "../src/data.js";
import { grantPro } from "./helpers/pro-access.js";

const fixture = () => {
  const doc = createProject("Имя сценария");
  doc.id = "editor-workflow";
  doc.content.content = [
    { type: "paragraph", attrs: { blockId: "first", format: "scene" } },
    {
      type: "paragraph",
      attrs: { blockId: "action", format: "action" },
      content: [{ type: "text", text: "Текст сценария." }],
    },
  ];
  return doc;
};
async function open(
  page,
  { pro = true, language = "ru", theme = "light" } = {},
) {
  if (pro) await grantPro(page);
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  await page.addInitScript(
    ({ doc, language, theme }) => {
      if (!sessionStorage.getItem("workflow-seed")) {
        sessionStorage.setItem("workflow-seed", "done");
        localStorage.setItem("tyter.projects.v1", JSON.stringify([doc]));
        localStorage.setItem("tyter.active", doc.id);
        localStorage.setItem("tyter.onboarding.v1", "done");
        localStorage.setItem("tyter.language.v1", language);
        localStorage.setItem(
          "tyter.editor-preferences.v1",
          JSON.stringify({ theme }),
        );
      }
      window.copyCalls = [];
      window.copyWrites = [];
      window.copyClosed = 0;
      window.copyAborted = 0;
      window.copyMode = "save";
      window.showSaveFilePicker = async (options) => {
        window.copyCalls.push({
          ...options,
          active: navigator.userActivation.isActive,
        });
        if (window.copyMode === "cancel")
          throw new DOMException("Canceled", "AbortError");
        if (window.copyMode === "pending")
          await new Promise((resolve) => {
            window.releaseCopy = resolve;
          });
        return {
          name: options.suggestedName,
          createWritable: async () => ({
            write: async (blob) => {
              if (window.copyMode === "error") throw new Error("Write failed");
              window.copyWrites.push(JSON.parse(await blob.text()));
            },
            close: async () => {
              window.copyClosed++;
            },
            abort: async () => {
              window.copyAborted++;
            },
          }),
        };
      };
    },
    { doc: fixture(), language, theme },
  );
  await page.goto(pro ? "/pro" : "/free");
  await expect(page.locator(".screenplay-editor")).toBeFocused();
}
const editorState = (page) =>
  page.locator(".screenplay-editor").evaluate((node) => ({
    content: node.editor.getJSON(),
    from: node.editor.state.selection.from,
    to: node.editor.state.selection.to,
    marks: node.editor.state.storedMarks?.map((mark) => mark.type.name) || [],
  }));

test("Ctrl+Shift+S saves a complete TYT copy with the same name and leaves selection/format/current file intact", async ({
  page,
}) => {
  await open(page);
  await page.locator('[data-block-id="action"]').click();
  await page.keyboard.press("End");
  await page.keyboard.insertText(" Свежая правка.");
  await page.keyboard.press("Shift+Home");
  const before = await editorState(page);
  await page.keyboard.press("Control+Shift+s");
  await expect.poll(() => page.evaluate(() => window.copyClosed)).toBe(1);
  const saved = await page.evaluate(() => ({
    calls: window.copyCalls,
    writes: window.copyWrites,
    active: localStorage.getItem("tyter.active"),
  }));
  expect(saved.calls).toHaveLength(1);
  expect(saved.calls[0]).toMatchObject({
    suggestedName: "Имя сценария.tyt",
    active: true,
    excludeAcceptAllOption: true,
  });
  expect(saved.writes[0]).toMatchObject({
    format: "tyter",
    version: 1,
    document: { id: "editor-workflow", title: "Имя сценария" },
  });
  expect(saved.writes[0].document.content).toEqual(before.content);
  expect(Array.isArray(saved.writes[0].history)).toBe(true);
  expect(saved.active).toBe("editor-workflow");
  expect(await editorState(page)).toEqual(before);
  await page.keyboard.press("Control+s");
  expect(await page.evaluate(() => window.copyCalls.length)).toBe(1);
});

test("copy dialog cancellation, held keys, Russian layout and write failures do not duplicate or mutate the file", async ({
  page,
}) => {
  await open(page);
  const before = await editorState(page);
  await page.evaluate(() => {
    window.copyMode = "cancel";
  });
  await page.keyboard.press("Control+Shift+s");
  await expect.poll(() => page.evaluate(() => window.copyCalls.length)).toBe(1);
  await expect(page.locator(".app-message")).toHaveCount(0);
  expect(await page.evaluate(() => window.copyWrites.length)).toBe(0);
  await page.evaluate(() => {
    window.copyMode = "pending";
  });
  await page.locator(".screenplay-editor").dispatchEvent("keydown", {
    key: "Ы",
    code: "KeyS",
    ctrlKey: true,
    shiftKey: true,
    bubbles: true,
  });
  await expect.poll(() => page.evaluate(() => window.copyCalls.length)).toBe(2);
  await page.locator(".screenplay-editor").dispatchEvent("keydown", {
    key: "Ы",
    code: "KeyS",
    ctrlKey: true,
    shiftKey: true,
    repeat: true,
    bubbles: true,
  });
  await page.keyboard.press("Control+Shift+s");
  expect(await page.evaluate(() => window.copyCalls.length)).toBe(2);
  await page.evaluate(() => window.releaseCopy());
  await expect.poll(() => page.evaluate(() => window.copyClosed)).toBe(1);
  await page.evaluate(() => {
    window.copyMode = "error";
  });
  await page.keyboard.press("Control+Shift+s");
  await expect.poll(() => page.evaluate(() => window.copyAborted)).toBe(1);
  await expect(page.locator(".app-message")).toContainText(
    "Не удалось сохранить файл",
  );
  expect(await editorState(page)).toEqual(before);
});

test("imported TYT filename is retained across reload even when its internal title differs", async ({
  page,
}) => {
  await open(page);
  const imported = createProject("Внутреннее название");
  const upload = page.locator('input[type="file"][accept*=".tyt"]').first();
  await upload.setInputFiles({
    name: "Мой файл 17.TYT",
    mimeType: "application/vnd.tyter+json",
    buffer: Buffer.from(
      JSON.stringify({
        format: "tyter",
        version: 1,
        document: imported,
        history: [],
      }),
    ),
  });
  await expect(page.locator(".document-trigger")).toContainText(
    "Внутреннее название",
  );
  await page.keyboard.press("Control+Shift+s");
  await expect.poll(() => page.evaluate(() => window.copyClosed)).toBe(1);
  expect(await page.evaluate(() => window.copyCalls[0].suggestedName)).toBe(
    "Мой файл 17.TYT",
  );
  await page.reload();
  await expect(page.locator(".screenplay-editor")).toBeFocused();
  await page.keyboard.press("Control+Shift+s");
  await expect.poll(() => page.evaluate(() => window.copyClosed)).toBe(1);
  expect(await page.evaluate(() => window.copyCalls[0].suggestedName)).toBe(
    "Мой файл 17.TYT",
  );
});

test("Free preserves the existing TYT gate and browsers without a picker still download the copy", async ({
  page,
}) => {
  await open(page, { pro: false });
  await page.keyboard.press("Control+Shift+s");
  await expect(page.locator(".subscription-dialog")).toBeVisible();
  expect(await page.evaluate(() => window.copyCalls.length)).toBe(0);
  await grantPro(page);
  await page.goto("/pro");
  await expect(page.locator(".screenplay-editor")).toBeFocused();
  await page.evaluate(() => {
    delete window.showSaveFilePicker;
  });
  const downloaded = page.waitForEvent("download");
  await page.keyboard.press("Control+Shift+s");
  expect((await downloaded).suggestedFilename()).toBe("Имя сценария.tyt");
});

for (const language of ["ru", "en"]) {
  test(`${language}: header order, compact suggestions and the thumbnail setting match in both themes`, async ({
    page,
  }, info) => {
    await open(page, { language, theme: language === "ru" ? "dark" : "light" });
    const switches = await page
      .locator(".header-switches")
      .evaluate((node) => [...node.children].map((child) => child.className));
    expect(switches).toEqual(["document-view-toggle", "language-switch"]);
    const settingsName =
      language === "ru" ? "Настройки документа" : "Document settings";
    const toggleName =
      language === "ru" ? "Миниатюры при наведении" : "Thumbnails on hover";
    await page.getByRole("button", { name: settingsName, exact: true }).click();
    const drawer = page.locator(".settings-drawer");
    const toggle = drawer.getByRole("switch", { name: toggleName });
    await expect(toggle).toBeChecked();
    await expect(drawer).not.toContainText(
      /Components and props|Компоненты и реквизит/,
    );
    await toggle.uncheck();
    await page.reload();
    await page.getByRole("button", { name: settingsName, exact: true }).click();
    await expect(toggle).not.toBeChecked();
    await page.screenshot({ path: info.outputPath("settings.png") });
    await page.keyboard.press("Escape");
    await page.locator('[data-block-id="first"]').click();
    const suggestions = page.locator(".word-suggestions");
    await expect(suggestions).toBeVisible();
    expect((await suggestions.boundingBox()).width).toBe(248);
    await expect(suggestions.locator("kbd")).toHaveText("Ctrl + Enter");
    await expect(suggestions).not.toContainText(/Shift|Esc|↑|↓/);
    await expect(suggestions.getByRole("option")).toHaveCount(4);
    await page.keyboard.press("Shift+ArrowDown");
    await page.keyboard.press("Control+Enter");
    await page.keyboard.insertText(language === "ru" ? "ДОМ — " : "HOUSE — ");
    await expect(suggestions.getByRole("option")).toHaveCount(12);
    await expect(suggestions.locator("kbd")).toHaveText("Ctrl + Enter");
    await expect(suggestions).not.toContainText(/Shift|Esc|↑|↓/);
    await suggestions.screenshot({ path: info.outputPath("suggestions.png") });
    await page.keyboard.press("Shift+ArrowDown");
    await page.keyboard.press("Control+Enter");
    await expect(suggestions).toHaveCount(0);
    await expect(page.locator('[data-block-id="first"]')).toContainText(
      language === "ru" ? "НОЧЬ" : "NIGHT",
    );
  });
}

for (const language of ["ru", "en"]) {
  test(`${language}: greeting is only in learning and stays absent from writing, reload and new documents`, async ({
    page,
  }, info) => {
    await page.route("**/__tyter_local/**", (route) =>
      route.fulfill({ status: 404 }),
    );
    await page.addInitScript((language) => {
      if (sessionStorage.getItem("intro-seed")) return;
      sessionStorage.setItem("intro-seed", "done");
      localStorage.setItem("tyter.language.v1", language);
      localStorage.setItem(
        "tyter.editor-preferences.v1",
        JSON.stringify({ theme: language === "ru" ? "dark" : "light" }),
      );
    }, language);
    await page.goto("/free");
    await expect(page.locator(".script-paper .editor-first-visit")).toHaveCount(
      0,
    );
    await expect(page.locator(".screenplay-editor")).toBeFocused();
    await page
      .getByRole("button", {
        name: language === "ru" ? "Обучение" : "Help",
      })
      .click();
    const tips = page.locator(".learning-paper .editor-first-visit");
    await expect(tips).toContainText(
      language === "ru"
        ? "Как быстрее работать с текстом?"
        : "How to work with text faster?",
    );
    await expect(tips.locator("p")).toHaveCount(7);
    await expect(tips.locator("p").nth(0)).toHaveText(
      language === "ru"
        ? "Чтобы стереть всё слово перед курсором, используй сочетание клавиш CTRL + Backspace."
        : "To delete the whole word before the cursor, use CTRL + Backspace.",
    );
    await expect(tips.locator("p").nth(1)).toHaveText(
      language === "ru"
        ? "Чтобы стереть всё слово после курсора, используй сочетание клавиш CTRL + Delete."
        : "To delete the whole word after the cursor, use CTRL + Delete.",
    );
    const before = await editorState(page);
    expect(JSON.stringify(before.content)).not.toMatch(
      /Backspace|Delete|SHIFT/,
    );
    await expect(page.locator(".screenplay-editor p").first()).toHaveAttribute(
      "data-format",
      "scene",
    );
    await expect(page.locator(".screenplay-editor p").first()).toHaveAttribute(
      "data-placeholder",
      language === "ru"
        ? "Начни писать свою историю..."
        : "Start writing your story...",
    );
    await page.screenshot({ path: info.outputPath("first-visit.png") });
    await page.setViewportSize({ width: 320, height: 844 });
    await expect(tips).toBeVisible();
    expect((await tips.boundingBox()).width).toBeLessThanOrEqual(288);
    expect(
      await page
        .locator(".learning-workspace")
        .evaluate((node) => node.scrollWidth - node.clientWidth),
    ).toBe(0);
    const switches = await page.locator(".header-switches").boundingBox();
    expect(switches.x + switches.width).toBeLessThanOrEqual(320);
    await page.screenshot({ path: info.outputPath("first-visit-mobile.png") });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator(".learning-back").click();
    await page.locator(".screenplay-editor").focus();
    await page.keyboard.insertText(
      language === "ru" ? "ИНТ. ДОМ" : "INT. HOUSE",
    );
    await expect(tips).toHaveCount(0);
    await page.keyboard.press("Control+z");
    await expect(tips).toHaveCount(0);
    await page.reload();
    await expect(page.locator(".screenplay-editor")).toBeVisible();
    await expect(tips).toHaveCount(0);
    // Remove the example so Free has room for a newly created document.
    await page.evaluate(() => {
      const docs = JSON.parse(localStorage.getItem("tyter.projects.v1"));
      localStorage.setItem(
        "tyter.projects.v1",
        JSON.stringify(docs.slice(0, 1)),
      );
    });
    await page.reload();
    await page.locator(".document-trigger").click();
    await page
      .getByRole("button", {
        name: language === "ru" ? "Новый сценарий" : "New screenplay",
        exact: true,
      })
      .click();
    await expect(tips).toHaveCount(0);
    await expect(page.locator(".screenplay-editor p").first()).toHaveAttribute(
      "data-format",
      "scene",
    );
    expect((await editorState(page)).from).toBe(1);
  });
}

import { test, expect } from "@playwright/test";
import { createProject } from "../src/data.js";
import { grantPro } from "./helpers/pro-access.js";

const paragraph = (format, text, blockId) => ({
  type: "paragraph",
  attrs: { format, blockId },
  ...(text ? { content: [{ type: "text", text }] } : {}),
});
const popup = (page) =>
  page.getByRole("listbox", { name: "Подсказки", exact: true });

async function open(
  page,
  { theme = "light", width = 1440, doctor = false, components } = {},
) {
  await page.setViewportSize({ width, height: width < 832 ? 844 : 1000 });
  await grantPro(page);
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  const doc = createProject("Подсказки без мигания");
  doc.id = "suggestions-stability";
  doc.content.content = [
    paragraph("scene", "ТЕКСТ", "first"),
    paragraph("scene", "", "other"),
  ];
  doc.components = components || [
    { id: "anna", name: "АННА", type: "character", description: "" },
  ];
  await page.addInitScript(
    ({ doc, theme, doctor }) => {
      localStorage.setItem("tyter.projects.v1", JSON.stringify([doc]));
      localStorage.setItem("tyter.active", doc.id);
      localStorage.setItem("tyter.language.v1", "ru");
      if (doctor)
        localStorage.setItem(
          "tyter.writing-timer.v1",
          JSON.stringify({
            coins: 0,
            session: null,
            purchases: {
              "script-doctor": { purchasedAt: Date.now(), cost: 20 },
            },
          }),
        );
      localStorage.setItem(
        "tyter.editor-preferences.v1",
        JSON.stringify({ theme }),
      );
    },
    { doc, theme, doctor },
  );
  await page.goto("/beta");
  await expect(page.locator(".screenplay-editor")).toBeVisible();
  await page.locator('[data-block-id="first"]').click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Control+1");
  await expect(popup(page)).toBeVisible();
}

const editorSelection = (page) =>
  page.locator(".ProseMirror").evaluate((node) => ({
    from: node.editor.state.selection.from,
    to: node.editor.state.selection.to,
    content: node.editor.getJSON(),
  }));

for (const theme of ["light", "dark"]) {
  test(`${theme}: held Shift and arrows navigate time suggestions without selecting or changing screenplay text`, async ({
    page,
  }, info) => {
    await open(page, { theme });
    await page.keyboard.press("Control+Enter");
    await page.keyboard.insertText("ДОМ — ");
    await expect(popup(page).getByRole("option")).toHaveCount(12);
    const selected = popup(page).locator('[aria-selected="true"]');
    await expect(selected).toContainText("ДЕНЬ");
    const before = await editorSelection(page);
    await observe(page);
    await page.keyboard.down("Shift");
    await page.keyboard.press("ArrowUp");
    await expect(selected).toContainText("ПРОДОЛЖЕНИЕ");
    await page.keyboard.press("ArrowDown");
    await expect(selected).toContainText("ДЕНЬ");
    await page.keyboard.press("ArrowDown");
    await expect(selected).toContainText("НОЧЬ");
    await page.keyboard.down("ArrowDown");
    await page.keyboard.down("ArrowDown");
    await page.keyboard.up("ArrowDown");
    await page.keyboard.up("Shift");
    await expect(selected).toContainText("УТРО");
    expect(await editorSelection(page)).toEqual(before);
    expect(await page.evaluate(() => window.suggestionChanges)).toEqual([]);
    await popup(page).screenshot({
      path: info.outputPath("shift-arrow-suggestions.png"),
    });
    await page.keyboard.press("Control+Enter");
    await expect(popup(page)).toHaveCount(0);
    await expect(page.locator(".screenplay-editor p").nth(1)).toContainText(
      "ИНТ. ДОМ — УТРО",
    );
    const accepted = await editorSelection(page);
    await page.keyboard.press("Shift+ArrowUp");
    const normalSelection = await editorSelection(page);
    expect(normalSelection.from).not.toBe(normalSelection.to);
    expect(normalSelection.content).toEqual(accepted.content);
  });
}

test("Shift and arrows choose components, while Ctrl+Enter inserts the chosen linked component", async ({
  page,
}) => {
  await open(page, {
    components: [
      { id: "anna", name: "АННА", type: "character", description: "" },
      {
        id: "anastasia",
        name: "АНАСТАСИЯ",
        type: "character",
        description: "",
      },
      { id: "anton", name: "АНТОН", type: "character", description: "" },
    ],
  });
  await page.keyboard.press("Control+2");
  await page.keyboard.insertText("АН");
  await expect(popup(page).getByRole("option")).toHaveCount(3);
  const before = await editorSelection(page);
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("Shift+ArrowDown");
  await expect(popup(page).locator('[aria-selected="true"]')).toContainText(
    "АНТОН",
  );
  expect(await editorSelection(page)).toEqual(before);
  await page.keyboard.press("Control+Enter");
  const content = (await editorSelection(page)).content.content[1].content;
  expect(
    content.some(
      (part) =>
        part.text === "АНТОН" &&
        part.marks?.some(
          (mark) => mark.type === "entity" && mark.attrs.id === "anton",
        ),
    ),
  ).toBe(true);
  await expect(popup(page)).toHaveCount(0);
});

async function observe(page) {
  await page.evaluate(() => {
    window.suggestionObserver?.disconnect();
    window.suggestionNode = document.querySelector(".word-suggestions");
    window.suggestionChanges = [];
    window.suggestionObserver = new MutationObserver((changes) => {
      for (const change of changes)
        for (const node of change.removedNodes)
          if (
            node instanceof Element &&
            (node.matches(".word-suggestions") ||
              node.querySelector(".word-suggestions"))
          )
            window.suggestionChanges.push({
              time: performance.now(),
              event: "removed",
            });
    });
    window.suggestionObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  });
}

test("new scene heading and time suggestions stay visible while the caret is idle", async ({
  page,
}, info) => {
  await open(page);
  await observe(page);
  await page.mouse.move(1300, 700);
  await page.waitForTimeout(3500);
  await page.screenshot({
    path: info.outputPath("empty-scene-suggestions.png"),
  });
  expect(await page.evaluate(() => window.suggestionChanges)).toEqual([]);
  await page.keyboard.press("Control+Enter");
  await expect(popup(page)).toHaveCount(0);
  await page.keyboard.insertText(" - ");
  await expect(popup(page)).toBeVisible();
  await observe(page);
  await page.waitForTimeout(3500);
  await page.screenshot({ path: info.outputPath("time-suggestions.png") });
  expect(await page.evaluate(() => window.suggestionChanges)).toEqual([]);
});

test("typing and deleting a valid prefix keeps the suggestion popup mounted", async ({
  page,
}) => {
  await open(page);
  await observe(page);
  for (const text of ["И", "Н", "Т"]) {
    await page.keyboard.insertText(text);
    await page.waitForTimeout(180);
  }
  await expect(popup(page).getByRole("option")).toHaveCount(2);
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  await expect(popup(page).getByRole("option")).toHaveCount(4);
  expect(
    await page.evaluate(
      () =>
        window.suggestionNode === document.querySelector(".word-suggestions"),
    ),
  ).toBe(true);
  expect(await page.evaluate(() => window.suggestionChanges)).toEqual([]);
});

for (const width of [320, 1440])
  for (const theme of ["light", "dark"]) {
    test(`${width}px ${theme}: moving to another empty scene updates the open popup without hiding it`, async ({
      page,
    }, info) => {
      await open(page, { width, theme });
      await observe(page);
      // Keyboard navigation reaches the last empty scene even when the wider popup covers it.
      await page.keyboard.press("Control+End");
      await page.waitForTimeout(250);
      await expect(popup(page).getByRole("option")).toHaveCount(4);
      expect(
        await page.evaluate(
          () =>
            window.suggestionNode ===
            document.querySelector(".word-suggestions"),
        ),
      ).toBe(true);
      expect(await page.evaluate(() => window.suggestionChanges)).toEqual([]);
      await page.screenshot({
        path: info.outputPath("stable-scene-suggestions.png"),
      });
      await page.keyboard.press("Control+Enter");
      await expect(page.locator('[data-block-id="other"]')).toContainText(
        "ИНТ.",
      );
    });
  }

test("silent scene replacement refreshes suggestions and cannot insert an old heading", async ({
  page,
}) => {
  await open(page);
  await observe(page);
  await page.evaluate(() => {
    const editor = document.querySelector(".ProseMirror").editor;
    const doc = editor.getJSON();
    const scene = doc.content.find((node) => !node.content?.length);
    const position = editor.state.selection.from;
    scene.content = [{ type: "text", text: "ИНТ. ДОМ — " }];
    editor
      .chain()
      .setContent(doc, { emitUpdate: false })
      .setTextSelection(position + scene.content[0].text.length)
      .run();
  });
  await expect(popup(page).getByRole("option").first()).toContainText("ДЕНЬ");
  expect(await page.evaluate(() => window.suggestionChanges)).toEqual([]);
  await page.keyboard.press("Control+Enter");
  await expect(page.locator(".screenplay-editor p").nth(1)).toContainText(
    "ИНТ. ДОМ — ДЕНЬ",
  );
  await expect(popup(page)).toHaveCount(0);
});

for (const theme of ["light", "dark"]) {
  test(`${theme}: scene and component suggestions work while desktop sidebars remain open`, async ({
    page,
  }) => {
    await open(page, { theme, doctor: true });
    await page
      .getByRole("button", { name: "Доктор сценария", exact: true })
      .click();
    await expect(page.locator(".doctor-drawer")).toBeVisible();
    const scene = page.locator('[data-block-id="other"]');
    await scene.click();
    await expect(popup(page)).toBeVisible();
    await expect(popup(page).getByRole("option")).toHaveCount(4);
    await page.keyboard.press("Control+Enter");
    await expect(scene).toContainText("ИНТ.");
    await page.keyboard.press("Control+2");
    await scene.evaluate((node) => {
      node.closest("[contenteditable]").focus();
      const range = document.createRange();
      range.selectNodeContents(node);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
    });
    await page.keyboard.insertText("АН");
    await expect(
      popup(page).getByRole("option", { name: /^АННА/ }),
    ).toBeVisible();
    await page.keyboard.press("Control+Enter");
    await expect(scene).toContainText("АННА");
    await expect(page.locator(".doctor-drawer")).toBeVisible();

    await page
      .getByRole("button", { name: "Поиск по сценарию", exact: true })
      .click();
    const search = page.getByRole("textbox", {
      name: "Поиск по тексту",
      exact: true,
    });
    await search.focus();
    await expect(popup(page)).toHaveCount(0);
    await scene.click();
    await page.keyboard.press("Control+1");
    await scene.evaluate((node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
    });
    await page.keyboard.press("Backspace");
    await expect(popup(page)).toBeVisible();
    await expect(page.locator(".search-drawer")).toBeVisible();
    await search.focus();
    await expect(popup(page)).toHaveCount(0);
    await scene.click();
    await expect(popup(page)).toBeVisible();
  });
}

test("right shot sidebar and full screen allow suggestions when the document has focus", async ({
  page,
}) => {
  await open(page);
  await page
    .getByRole("button", { name: "Информация о кадре сцены 3", exact: true })
    .click();
  const panel = page.getByRole("complementary", {
    name: "Информация о кадре",
    exact: true,
  });
  await expect(panel).toBeVisible();
  const scene = page.locator('[data-block-id="other"]');
  await scene.click();
  await expect(popup(page)).toBeVisible();
  await panel.getByRole("button", { name: "Дата съёмок", exact: true }).click();
  await panel.locator('input[type="date"]').focus();
  await expect(popup(page)).toHaveCount(0);
  await scene.click();
  await expect(popup(page)).toBeVisible();
  await page
    .getByRole("button", { name: "Открыть во весь экран", exact: true })
    .click();
  await expect(panel).toHaveCount(0);
  await expect(popup(page)).toBeVisible();
  await page.keyboard.press("Control+Enter");
  await expect(scene).toContainText("ИНТ.");
});

test("mobile sidebar sheets hide suggestions until closed and the user returns to the document", async ({
  page,
}) => {
  await open(page, { width: 390 });
  await page
    .getByRole("button", { name: "Информация о кадре сцены 3", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Панель сценария", exact: true }),
  ).toBeVisible();
  await expect(popup(page)).toHaveCount(0);
  await page
    .getByRole("button", { name: "Закрыть информацию о кадре", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Панель сценария", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Control+End");
  await expect(popup(page)).toBeVisible();
  await page.keyboard.press("Control+Enter");
  await expect(page.locator('[data-block-id="other"]')).toContainText("ИНТ.");
});

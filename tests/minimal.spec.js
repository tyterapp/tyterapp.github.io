import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";
import { inflateSync } from "node:zlib";

test.beforeEach(async ({ page }, testInfo) => {
  if (!testInfo.title.startsWith("onboarding"))
    await page.addInitScript(() =>
      localStorage.setItem("tyter.onboarding.v1", "done"),
    );
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ json: { documents: [], directory: "Test documents" } }),
  );
});

const p = (format, text, id) => ({
  type: "paragraph",
  attrs: { format, blockId: id },
  ...(text ? { content: [{ type: "text", text }] } : {}),
});
const fixture = () => ({
  id: "document-test",
  title: "Тихий берег",
  updatedAt: "2026-09-18T10:00:00.000Z",
  content: {
    type: "doc",
    content: [
      p("scene", "ИНТ. ДОМ — ДЕНЬ", "scene"),
      p("action", "Анна смотрит в окно. На столе горит лампа.", "action"),
      p("character", "АННА", "character"),
      p("parenthetical", "(тихо)", "parenthetical"),
      p("speech", "Я всё ещё помню этот берег.", "speech"),
      p("transition", "ЗАТЕМНЕНИЕ:", "transition"),
      p("plain", "Конец.", "plain"),
    ],
  },
  components: [
    {
      id: "anna",
      name: "Анна",
      type: "character",
      description: "Главная героиня",
      color: "#8a799a",
    },
    {
      id: "ivan",
      name: "Иван Петров",
      type: "character",
      description: "",
      color: "#8a799a",
    },
  ],
  props: [],
  comments: [],
  settings: {},
});
const editor = (page) =>
  page.getByRole("textbox", { name: "Screenplay editor" });
const block = (page, id = "action") =>
  page.locator(`.screenplay-editor p[data-block-id="${id}"]`);
const popup = (page) => page.getByRole("listbox", { name: "Подсказки" });
async function seed(page, docs = [fixture()]) {
  await page.addInitScript((docs) => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.setItem("tyter.projects.v1", JSON.stringify(docs));
      localStorage.setItem("tyter.active", docs[0].id);
      sessionStorage.setItem("seeded", "true");
    }
  }, docs);
  await page.goto("/app");
  await expect(editor(page)).toBeVisible();
}
async function caret(page, locator, from, to = from) {
  await locator.evaluate(
    (el, { from, to }) => {
      el.closest("[contenteditable]").focus();
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT),
        nodes = [];
      let node;
      while ((node = walker.nextNode())) nodes.push(node);
      const point = (offset) => {
        for (const n of nodes) {
          if (offset <= n.length) return [n, offset];
          offset -= n.length;
        }
        return [el, 0];
      };
      const range = document.createRange();
      range.setStart(...point(from));
      range.setEnd(...point(to));
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
    },
    { from, to },
  );
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString() || ""))
    .toBe(to > from ? (await locator.textContent()).slice(from, to) : "");
  // A key event makes the browser flush selectionchange before the next edit.
  await page.keyboard.press("Shift");
}
async function replaceAction(page, text) {
  await caret(page, block(page), 0, (await block(page).textContent()).length);
  await page.keyboard.insertText(text);
}
async function saved(page) {
  await expect(page.getByRole("banner").getByRole("status")).toHaveText(
    "Сохранено на устройстве",
  );
}
async function download(page, label, name, testInfo) {
  await page
    .getByRole("button", { name: "Скачать сценарий", exact: true })
    .click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: label }).click();
  const file = await pending;
  expect(file.suggestedFilename()).toBe(name);
  const path = testInfo.outputPath(name);
  await file.saveAs(path);
  return { path, bytes: await readFile(path) };
}

test("the screenplay sheet loads the supplied Cyrillic Courier font", async ({
  page,
}, testInfo) => {
  const fontResponse = page.waitForResponse((response) =>
    response.url().endsWith("/fonts/couriercyrillic.ttf"),
  );
  await seed(page);
  expect((await fontResponse).status()).toBe(200);
  const face = await editor(page).evaluate(async (node) => {
    await document.fonts.load('16px "Screenplay Courier Cyrillic"', "Анна");
    return {
      family: getComputedStyle(node).fontFamily,
      loaded: document.fonts.check(
        '16px "Screenplay Courier Cyrillic"',
        "Анна",
      ),
    };
  });
  expect(face.family).toContain("Screenplay Courier Cyrillic");
  expect(face.loaded).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("courier-cyrillic.png") });
});

test("minimal screen preserves existing local documents and every screenplay format", async ({
  page,
}) => {
  const first = fixture();
  first.comments = [
    {
      id: "old-comment",
      text: "Старая заметка",
      quote: "Анна",
      blockId: "action",
      createdAt: "2026-09-18T10:00:00.000Z",
    },
  ];
  await seed(page, [
    first,
    { ...fixture(), id: "second", title: "Второй сценарий" },
  ]);
  await expect(
    page.getByRole("button", { name: "Документы", exact: true }),
  ).toContainText(first.title);
  await expect(page.getByText("All projects", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Comments", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Props", { exact: true })).toHaveCount(0);
  for (const node of first.content.content)
    await expect(block(page, node.attrs.blockId)).toHaveAttribute(
      "data-format",
      node.attrs.format,
    );
  await saved(page);
  await page.reload();
  await expect(block(page)).toContainText("Анна смотрит");
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("tyter.projects.v1"))[0].comments[0]
          .text,
    ),
  ).toBe("Старая заметка");
  await page.getByRole("button", { name: "Документы", exact: true }).click();
  await page
    .locator(".document-item")
    .filter({ hasText: "Второй сценарий" })
    .click();
  await expect(
    page.getByRole("button", { name: "Документы", exact: true }),
  ).toContainText("Второй сценарий");
});

test("Ctrl+1…7 changes the paragraph at the caret without moving it; Enter follows screenplay order", async ({
  page,
}) => {
  await seed(page);
  await caret(page, block(page), 5);
  const formats = [
    "scene",
    "action",
    "character",
    "speech",
    "parenthetical",
    "transition",
    "plain",
  ];
  for (let i = 0; i < formats.length; i++) {
    await page.keyboard.press(`Control+${i + 1}`);
    await expect(block(page)).toHaveAttribute("data-format", formats[i]);
    expect(
      await block(page).evaluate((element) => {
        const selection = window.getSelection();
        const beforeCaret = document.createRange();
        beforeCaret.selectNodeContents(element);
        beforeCaret.setEnd(selection.anchorNode, selection.anchorOffset);
        return beforeCaret.cloneContents().textContent.length;
      }),
    ).toBe(5);
    await expect(block(page, "scene")).toHaveAttribute("data-format", "scene");
  }
  await page.keyboard.press("Control+3");
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await expect(page.locator(".screenplay-editor p").nth(2)).toHaveAttribute(
    "data-format",
    "speech",
  );
  await page.keyboard.insertText("Проверка реплики.");
  await saved(page);
  await page.reload();
  await expect(editor(page)).toContainText("Проверка реплики.");
});

test("Ctrl+Alt+arrows cycles paragraph formats in both directions without moving selected text", async ({
  page,
}) => {
  await seed(page);
  const text = await block(page).textContent();
  await caret(page, block(page), 4, 12);
  const selected = text.slice(4, 12);
  for (const [key, formats] of [
    [
      "ArrowRight",
      [
        "character",
        "speech",
        "parenthetical",
        "transition",
        "plain",
        "scene",
        "action",
      ],
    ],
    [
      "ArrowLeft",
      [
        "scene",
        "plain",
        "transition",
        "parenthetical",
        "speech",
        "character",
        "action",
      ],
    ],
  ]) {
    for (const format of formats) {
      await page.keyboard.press(`Control+Alt+${key}`);
      await expect(block(page)).toHaveAttribute("data-format", format);
      await expect(block(page)).toHaveText(text);
      expect(
        await page.evaluate(
          () => window.getSelection().getRangeAt(0).cloneContents().textContent,
        ),
      ).toBe(selected);
      await expect(block(page, "scene")).toHaveAttribute(
        "data-format",
        "scene",
      );
    }
  }
  await page.keyboard.press("Control+3");
  await expect(block(page)).toHaveAttribute("data-format", "character");
  await page.keyboard.press("Control+Alt+ArrowRight");
  await expect(block(page)).toHaveAttribute("data-format", "speech");
  await saved(page);
  await page.reload();
  await expect(block(page)).toHaveAttribute("data-format", "speech");
  await expect(block(page)).toHaveText(text);
});

test("ordinary words have no suggestions and components support arrows and Escape", async ({
  page,
}) => {
  await seed(page);
  await replaceAction(page, "абаж");
  await expect(popup(page)).toHaveCount(0);
  await replaceAction(page, "Ан");
  await expect(popup(page)).toBeVisible();
  await expect(popup(page).getByRole("option").first()).toContainText("Анна");
  await page.keyboard.press("ArrowDown");
  const chosen = await popup(page)
    .getByRole("option", { selected: true })
    .locator("span:not(.suggestion-spacer)")
    .textContent();
  await page.keyboard.press("Control+Tab");
  await expect(block(page)).toHaveText(chosen + " ");
  await expect(block(page)).toHaveAttribute("data-format", "action");
  await expect(popup(page)).toHaveCount(0);
  await replaceAction(page, "Ан");
  await expect(popup(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(popup(page)).toHaveCount(0);
  await expect(block(page)).toHaveText("Ан");
  await page.keyboard.press("Tab");
  await expect(block(page)).toHaveAttribute("data-format", "action");
});

test("plain Tab never accepts an open suggestion", async ({ page }) => {
  await seed(page);
  await replaceAction(page, "Ан");
  await expect(popup(page)).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(block(page)).toHaveText("Ан");
});

test("Ctrl+Enter is shown and accepts a suggestion", async ({ page }) => {
  await seed(page);
  await replaceAction(page, "Ан");
  await expect(popup(page)).toBeVisible();
  await expect(popup(page).locator("kbd")).toHaveText("Ctrl + Enter");
  await expect(popup(page)).not.toContainText("Ctrl + Tab");
  await page.keyboard.press("Control+Enter");
  await expect(block(page)).toHaveText("Анна ");
  await expect(block(page).locator('[data-entity-id="anna"]')).toHaveText(
    "Анна",
  );
});

test("new local libraries start with the two example documents", async ({
  page,
}) => {
  await page.goto("/app");
  await page.getByRole("button", { name: "Документы", exact: true }).click();
  await expect(page.locator(".document-row")).toHaveCount(2);
  await expect(page.locator(".document-row").first()).toContainText(
    "Без названия",
  );
  await expect(page.locator(".document-row").last()).toContainText(
    "Глазами кошки",
  );
  await page.locator(".document-row").last().locator(".document-item").click();
  await expect(editor(page)).toContainText("КОШКА");
});

test("component suggestions lead the list, show an icon and insert a linked multiword name", async ({
  page,
}) => {
  await seed(page);
  await replaceAction(page, "Иван Пе");
  await expect(popup(page)).toBeVisible();
  const first = popup(page).getByRole("option").first();
  await expect(first).toContainText("Иван Петров");
  await expect(first.locator('svg[aria-label="Компонент"]')).toBeVisible();
  await page.keyboard.press("Control+Tab");
  await expect(block(page)).toHaveText("Иван Петров ");
  await expect(block(page).locator('[data-entity-id="ivan"]')).toHaveText(
    "Иван Петров",
  );
  await page.keyboard.insertText("уходит.");
  await expect(block(page).locator('[data-entity-id="ivan"]')).toHaveText(
    "Иван Петров",
  );
  await saved(page);
  await page.reload();
  await expect(block(page).locator('[data-entity-id="ivan"]')).toBeVisible();
});

test("component suggestions support numeric and mixed numeric names", async ({
  page,
}) => {
  const doc = fixture();
  doc.components.push(
    {
      id: "room-101",
      name: "101",
      type: "place",
      description: "Комната",
      color: "#738598",
    },
    {
      id: "agent-47",
      name: "Агент 47",
      type: "character",
      description: "",
      color: "#8a799a",
    },
  );
  await seed(page, [doc]);

  await replaceAction(page, "1");
  await expect(popup(page)).toBeVisible();
  await expect(popup(page).getByRole("option").first()).toContainText("101");
  await page.keyboard.press("Control+Tab");
  await expect(block(page)).toHaveText("101 ");
  await expect(block(page).locator('[data-entity-id="room-101"]')).toHaveText(
    "101",
  );

  await replaceAction(page, "Агент 4");
  await expect(popup(page)).toBeVisible();
  await expect(popup(page).getByRole("option").first()).toContainText(
    "Агент 47",
  );
  await page.keyboard.press("Control+Tab");
  await expect(block(page)).toHaveText("Агент 47 ");
  await expect(block(page).locator('[data-entity-id="agent-47"]')).toHaveText(
    "Агент 47",
  );
  await saved(page);
  await page.reload();
  await expect(
    block(page).locator('[data-entity-id="agent-47"]'),
  ).toBeVisible();
});

test("a selected phrase creates a component immediately and keeps its text link when renamed", async ({
  page,
}) => {
  await seed(page);
  const original = await block(page).textContent();
  const start = original.indexOf("лампа");
  await caret(page, block(page), start, start + 5);
  await page
    .getByRole("button", { name: "Создать компонент из выделения" })
    .click();
  const panel = page.getByRole("complementary", {
    name: "Компоненты сценария",
  });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(panel.getByLabel("Название", { exact: true })).toHaveValue(
    "лампа",
  );
  await panel.getByLabel("Название", { exact: true }).fill("Лампа у окна");
  await panel.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(block(page)).toHaveText(
    original.replace("лампа", "Лампа у окна"),
  );
  await expect(
    block(page)
      .locator("[data-entity-id]")
      .filter({ hasText: /^Лампа у окна$/ }),
  ).toHaveText("Лампа у окна");
  await expect(
    page.getByRole("complementary", { name: "Компоненты сценария" }),
  ).toContainText("Лампа у окна");
  await saved(page);
  await page.reload();
  await page.getByRole("button", { name: "Компоненты", exact: true }).click();
  await expect(
    page.locator(".component-item").filter({ hasText: "Лампа у окна" }),
  ).toBeVisible();
  await caret(page, block(page), start);
  await caret(page, block(page), start, start + "Лампа у окна".length);
  await page
    .getByRole("button", { name: "Создать компонент из выделения" })
    .click();
  await expect(
    page
      .getByRole("complementary", { name: "Компоненты сценария" })
      .getByLabel("Название", { exact: true }),
  ).toHaveValue("Лампа у окна");
  await expect(
    page.getByRole("dialog", { name: "Новый компонент" }),
  ).toHaveCount(0);
});

test("new documents, renaming, switching and per-document components persist", async ({
  page,
}) => {
  await seed(page);
  await page.getByRole("button", { name: "Документы", exact: true }).click();
  await page
    .getByRole("button", { name: "Новый сценарий", exact: true })
    .click();
  await expect(editor(page).locator("p")).toHaveCount(1);
  await editor(page).click();
  await page.keyboard.insertText("ИНТ. КАФЕ — НОЧЬ");
  await page.getByRole("button", { name: "Документы", exact: true }).click();
  await page.locator(".document-row.active .document-more").click();
  await page
    .getByRole("button", { name: "Переименовать", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Название сценария" });
  await dialog.getByLabel("Название", { exact: true }).fill("Ночной разговор");
  await dialog.getByRole("button", { name: "Сохранить", exact: true }).click();
  await saved(page);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Документы", exact: true }),
  ).toContainText("Ночной разговор");
  await expect(editor(page)).toHaveText("ИНТ. КАФЕ — НОЧЬ");
  await page.getByRole("button", { name: "Компоненты", exact: true }).click();
  await expect(page.getByRole("button", { name: /Анна Главная/ })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Документы", exact: true }).click();
  await page.getByLabel("Найти документ").fill("Тихий");
  await page
    .locator(".document-item")
    .filter({ hasText: "Тихий берег" })
    .click();
  await expect(block(page)).toContainText("Анна смотрит");
});

test("document row menu renames and deletes the selected document without switching", async ({
  page,
}) => {
  await seed(page, [
    fixture(),
    { ...fixture(), id: "second", title: "Второй сценарий" },
  ]);
  await page.getByRole("button", { name: "Документы", exact: true }).click();
  await expect(page.locator(".document-menu > .menu-item")).toHaveCount(2);
  const documentListWidth = await page
    .locator(".document-list")
    .evaluate((el) => ({
      visible: el.clientWidth,
      content: el.scrollWidth,
    }));
  expect(documentListWidth.content).toBeLessThanOrEqual(
    documentListWidth.visible,
  );
  await page
    .locator('.document-row[data-document-id="second"] .document-more')
    .click();
  await page
    .getByRole("button", { name: "Переименовать", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Название сценария" });
  await dialog.getByLabel("Название", { exact: true }).fill("Новый второй");
  await dialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(
    page.getByRole("button", { name: "Документы", exact: true }),
  ).toContainText("Тихий берег");
  await page.getByRole("button", { name: "Документы", exact: true }).click();
  await expect(
    page.locator('.document-row[data-document-id="second"]'),
  ).toContainText("Новый второй");
  await page
    .locator('.document-row[data-document-id="second"] .document-more')
    .click();
  await page
    .getByRole("button", { name: "Удалить документ", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Удалить документ?" })
    .getByRole("button", { name: "Удалить" })
    .click();
  await page.getByRole("button", { name: "Документы", exact: true }).click();
  await expect(page.locator(".document-row")).toHaveCount(1);
  await expect(page.locator(".document-row")).toContainText("Тихий берег");
});

test("FDX download retains Unicode, escapes XML and round-trips element types", async ({
  page,
}, testInfo) => {
  const doc = fixture();
  doc.content.content[1].content[0].text = "Анна & Иван <ждут> «корабль».";
  await seed(page, [doc]);
  const { path, bytes } = await download(
    page,
    /Final Draft · FDX/,
    "Тихий берег.fdx",
    testInfo,
  );
  const xml = bytes.toString("utf8");
  expect(xml).toContain("&amp; Иван &lt;ждут&gt;");
  const actionText = await page.evaluate(
    (xml) =>
      new DOMParser()
        .parseFromString(xml, "text/xml")
        .querySelector('Paragraph[Type="Action"]').textContent,
    xml,
  );
  expect(actionText).toBe("Анна & Иван <ждут> «корабль».");
  for (const type of [
    "Scene Heading",
    "Action",
    "Character",
    "Parenthetical",
    "Dialogue",
    "Transition",
    "General",
  ])
    expect(xml).toContain(`Type="${type}"`);
  await page.locator("input[type=file]").setInputFiles(path);
  await expect(block(page)).toHaveCount(0);
  await expect(editor(page)).toContainText("Анна & Иван <ждут>");
  const formats = await editor(page)
    .locator("p")
    .evaluateAll((nodes) => nodes.map((n) => n.dataset.format));
  expect(formats).toEqual([
    "scene",
    "action",
    "character",
    "parenthetical",
    "speech",
    "transition",
    "plain",
  ]);
});

test("DOCX is a real Word file with Cyrillic, screenplay styles and page layout", async ({
  page,
}, testInfo) => {
  await seed(page);
  const { bytes } = await download(
    page,
    /Word · DOCX/,
    "Тихий берег.docx",
    testInfo,
  );
  expect(bytes.subarray(0, 2).toString()).toBe("PK");
  const zip = unzipSync(bytes);
  const xml = strFromU8(zip["word/document.xml"]);
  expect(xml.replace(/<[^>]+>/g, "")).toContain("Анна смотрит в окно.");
  expect(xml).toContain('w:ascii="Courier New"');
  expect(xml).toContain('w:left="2160"');
  expect(xml).toContain('w:pStyle w:val="speech"');
  expect(xml).toContain('w:line="240"');
  expect(xml).toContain('w:w="12240"');
});

test("PDF is a real embedded-font document and long scripts paginate", async ({
  page,
}, testInfo) => {
  const doc = fixture();
  for (let i = 0; i < 45; i++)
    doc.content.content.push(
      p(
        "action",
        `Абзац ${i + 1}. Тихая река отражает огни города. Анна возвращается домой и закрывает за собой дверь.`,
        `long-${i}`,
      ),
    );
  await seed(page, [doc]);
  const { bytes } = await download(
    page,
    /PDF Для чтения/,
    "Тихий берег.pdf",
    testInfo,
  );
  const raw = bytes.toString("latin1");
  expect(raw.startsWith("%PDF-")).toBe(true);
  expect(raw).toContain("/FontFile2");
  expect((raw.match(/\/Type \/Page\b/g) || []).length).toBeGreaterThan(2);
  expect(raw).toContain("/MediaBox [0 0 642. 792.]");
});

test("mobile screen has no horizontal overflow and core menus remain usable", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page.getByRole("button", { name: "Компоненты", exact: true }).click();
  await expect(
    page.getByRole("complementary", { name: "Компоненты сценария" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Закрыть компоненты" }).click();
  await expect(
    page.getByRole("button", { name: "Ремарка", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.screenshot({ path: testInfo.outputPath("mobile.png") });
});

test("bottom format strip preserves the caret and left rail opens comments", async ({
  page,
}, testInfo) => {
  await seed(page);
  const bar = page.getByRole("group", { name: "Форматирование сценария" });
  await expect(bar.getByRole("button")).toHaveCount(7);
  await expect(page.locator(".word-count")).toHaveCount(0);
  await caret(page, block(page), 5);
  await expect(
    bar.getByRole("button", { name: "Действие", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await bar.getByRole("button", { name: "Персонаж", exact: true }).hover();
  await expect(page.locator(".unified-tooltip")).toHaveText("CTRL + 3");
  await bar.getByRole("button", { name: "Персонаж", exact: true }).click();
  await expect(block(page)).toHaveAttribute("data-format", "character");
  await page.keyboard.insertText("X");
  await expect(block(page)).toHaveText(
    "Анна Xсмотрит в окно. На столе горит лампа.",
  );
  await page.keyboard.press("Control+2");
  await expect(
    bar.getByRole("button", { name: "Действие", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await caret(page, block(page), 0, 4);
  const comments = page.locator(".workspace-tools .comments-toggle");
  await comments.click();
  await expect(page.locator(".composer-quote")).toContainText("Анна");
  await page
    .getByRole("textbox", { name: "Текст комментария" })
    .fill("Уточнить действие");
  await page.getByRole("button", { name: "Добавить", exact: true }).click();
  await expect(comments.locator("small")).toHaveText("1");
  await page.getByRole("button", { name: "Решено", exact: true }).click();
  await expect(comments.locator("small")).toHaveCount(0);
  await page.getByRole("button", { name: "Закрыть комментарии" }).click();
  await bar.getByRole("button", { name: "ИНТ/ЭКС", exact: true }).hover();
  await expect(page.locator(".unified-tooltip")).toHaveText("CTRL + 1");
  await page.screenshot({ path: testInfo.outputPath("format-strip.png") });
});

test("document setting switches the quick bar between text and supplied icons", async ({
  page,
}, testInfo) => {
  const second = { ...fixture(), id: "second", title: "Второй сценарий" };
  await seed(page, [fixture(), second]);
  const bar = page.getByRole("group", { name: "Форматирование сценария" });
  await expect(bar.locator(".format-bar-icon")).toHaveCount(0);
  await page.getByRole("button", { name: "Настройки документа" }).click();
  const settings = page.getByRole("complementary", {
    name: "Настройки документа",
  });
  const mode = settings.getByRole("group", { name: "Вид нижней панели" });
  await expect(mode.getByRole("button", { name: "Текст" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await mode.getByRole("button", { name: "Иконки" }).click();
  await expect(mode.getByRole("button", { name: "Иконки" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(bar.locator(".format-bar-icon")).toHaveCount(7);
  await expect
    .poll(() =>
      bar
        .locator(".format-bar-icon")
        .evaluateAll((icons) =>
          icons.every((icon) => icon.complete && icon.naturalWidth > 0),
        ),
    )
    .toBe(true);
  await bar.getByRole("button", { name: "Персонаж" }).hover();
  await expect(page.locator(".unified-tooltip")).toHaveText(
    "Персонаж · CTRL + 3",
  );
  await page.locator(".workspace-tools .comments-toggle").hover();
  await expect(page.locator(".unified-tooltip")).toHaveText("Комментарии");
  await caret(page, block(page), 5);
  await bar.getByRole("button", { name: "Персонаж" }).click();
  await expect(block(page)).toHaveAttribute("data-format", "character");
  await page.screenshot({ path: testInfo.outputPath("icon-format-bar.png") });
  await saved(page);
  await page.reload();
  await expect(bar.locator(".format-bar-icon")).toHaveCount(7);
  await page.getByRole("button", { name: "Настройки документа" }).click();
  const reopenedMode = page.getByRole("group", { name: "Вид нижней панели" });
  await reopenedMode.getByRole("button", { name: "Текст" }).click();
  await expect(bar.locator(".format-bar-icon")).toHaveCount(0);
  await reopenedMode.getByRole("button", { name: "Иконки" }).click();
  await expect(bar.locator(".format-bar-icon")).toHaveCount(7);
  await page.getByRole("button", { name: "Документы", exact: true }).click();
  await page
    .locator('.document-row[data-document-id="second"] .document-item')
    .click();
  await expect(bar.locator(".format-bar-icon")).toHaveCount(0);
  await expect(bar.getByRole("button", { name: "Действие" })).toContainText(
    "Действие",
  );
});

test("document statistics are live, document-specific, and replace other sidebars", async ({
  page,
}, testInfo) => {
  const empty = {
    ...fixture(),
    id: "empty",
    title: "Пустой",
    content: { type: "doc", content: [p("scene", "", "empty-scene")] },
    components: [],
  };
  await seed(page, [fixture(), empty]);
  await page
    .getByRole("button", { name: "Статистика документа", exact: true })
    .click();
  const panel = page.getByRole("complementary", {
    name: "Статистика документа",
  });
  const metric = (label) =>
    panel
      .locator(".statistics-overview > div")
      .filter({ has: page.getByText(label, { exact: true }) })
      .locator("strong");
  await expect(metric("Слов")).toHaveText("21");
  await expect(metric("Сцен")).toHaveText("1");
  await expect(metric("Персонажей")).toHaveText("1");
  await expect(panel.locator(".statistics-characters")).toContainText("АННА");
  await expect(panel.locator(".statistics-characters")).toContainText("6 слов");
  await replaceAction(page, "Анна");
  await expect(metric("Слов")).toHaveText("14");
  await page.screenshot({ path: testInfo.outputPath("statistics.png") });
  await page.getByRole("button", { name: "Комментарии", exact: true }).click();
  await expect(panel).toHaveCount(0);
  await page
    .getByRole("button", { name: "Статистика документа", exact: true })
    .click();
  await expect(
    page.getByRole("complementary", { name: "Комментарии сценария" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Документы", exact: true }).click();
  await page.locator(".document-item").filter({ hasText: "Пустой" }).click();
  await expect(metric("Слов")).toHaveText("0");
  await expect(metric("Сцен")).toHaveText("0");
  await expect(metric("Страниц")).toHaveText("1");
});

test("desktop suggestions and component panel stay unobtrusive", async ({
  page,
}, testInfo) => {
  await seed(page);
  await page.getByRole("button", { name: "Компоненты", exact: true }).click();
  await caret(page, block(page), 0, 4);
  await page.keyboard.insertText("Ан");
  await expect(popup(page)).toBeVisible();
  const rect = await popup(page).boundingBox();
  expect(rect.x).toBeGreaterThan(0);
  expect(rect.x + rect.width).toBeLessThan(1440);
  await page.screenshot({ path: testInfo.outputPath("desktop.png") });
});

test("unavailable dictionary does not prevent component completion", async ({
  page,
}) => {
  await page
    .context()
    .route("**/dictionary/words.txt", (route) =>
      route.fulfill({ status: 503, body: "" }),
    );
  await seed(page);
  await expect(page.locator(".dictionary-status")).toHaveCount(0);
  await replaceAction(page, "Ан");
  await expect(popup(page).getByRole("option").first()).toContainText("Анна");
  await page.keyboard.press("Control+Tab");
  await expect(block(page)).toHaveText("Анна ");
});

test("unreadable local data is not silently overwritten", async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("tyter.projects.v1", "damaged existing data"),
  );
  await page.goto("/app");
  await expect(page.getByRole("alert")).toContainText(
    "Исходные данные сохранены",
  );
  await expect(page.getByRole("status")).toContainText("Не сохранено");
  await editor(page).click();
  await page.keyboard.insertText("Новый текст");
  await page.keyboard.press("Control+s");
  expect(
    await page.evaluate(() => localStorage.getItem("tyter.projects.v1")),
  ).toBe("damaged existing data");
});

test("save failure is visible and does not prevent downloading a copy", async ({
  page,
}, testInfo) => {
  await seed(page);
  await saved(page);
  await page.evaluate(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "tyter.projects.v1")
        throw new DOMException("Storage full", "QuotaExceededError");
      return set.call(this, key, value);
    };
  });
  await replaceAction(page, "Этот текст нужно сохранить.");
  await expect(page.getByRole("status")).toContainText("Не сохранено");
  const { bytes } = await download(
    page,
    /Final Draft · FDX/,
    "Тихий берег.fdx",
    testInfo,
  );
  expect(bytes.toString("utf8")).toContain("Этот текст нужно сохранить.");
});

test("empty-document placeholder appears only once and never in subsequent blank paragraphs", async ({
  page,
}) => {
  const doc = fixture();
  doc.content.content = [p("action", "", "empty"), p("action", "", "empty2")];
  await seed(page, [doc]);
  await expect(editor(page).locator("[data-placeholder]")).toHaveCount(1);
  await expect(block(page, "empty")).toHaveAttribute(
    "data-placeholder",
    "Начни писать свою историю...",
  );
  await caret(page, block(page, "empty"), 0);
  await page.keyboard.insertText("История начинается.");
  await page.keyboard.press("Enter");
  await expect(editor(page).locator("[data-placeholder]")).toHaveCount(0);
  await editor(page).press("Control+a");
  await page.keyboard.press("Backspace");
  await expect(editor(page).locator("[data-placeholder]")).toHaveCount(1);
});

test("scene prefixes are offered at the start and Ctrl+Enter inserts the chosen heading", async ({
  page,
}) => {
  const doc = fixture();
  doc.content.content = [p("scene", "", "scene")];
  await seed(page, [doc]);
  await caret(page, block(page, "scene"), 0);
  await expect(popup(page).getByRole("option")).toHaveCount(4);
  for (const text of ["ИНТ.", "ЭКС.", "ИНТ. / ЭКС.", "ЭКС. / ИНТ."])
    await expect(popup(page).getByText(text, { exact: true })).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Control+Enter");
  await expect(block(page, "scene")).toHaveText("ИНТ. / ЭКС. ");
  await page.keyboard.insertText("ДОМ — ");
  await expect(popup(page).getByRole("option")).toHaveCount(4);
  await expect(popup(page).getByRole("option").first()).toContainText("ДЕНЬ");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Control+Enter");
  await expect(block(page, "scene")).toHaveText("ИНТ. / ЭКС. ДОМ — НОЧЬ ");
  await expect(popup(page)).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expect(editor(page).locator("p").last()).toHaveAttribute(
    "data-format",
    "action",
  );
  await expect(editor(page).locator("[data-placeholder]")).toHaveCount(0);
});

test("scene heading components appear alongside built-in prefixes and Ctrl+Enter keeps their link", async ({
  page,
}) => {
  const doc = fixture();
  doc.content.content = [p("scene", "ин", "scene")];
  doc.components.push({
    id: "interior",
    name: "Интерьер музея",
    type: "place",
    color: "#8a799a",
  });
  await seed(page, [doc]);
  const scene = block(page, "scene");
  await caret(page, scene, 2);
  const first = popup(page).getByRole("option").first();
  await expect(first).toContainText("Интерьер музея");
  await expect(first.locator('svg[aria-label="Компонент"]')).toBeVisible();
  await expect(popup(page).getByText("ИНТ.", { exact: true })).toBeVisible();
  await expect(
    popup(page).getByText("ИНТ. / ЭКС.", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Control+Enter");
  await expect(scene).toHaveText("ИНТЕРЬЕР МУЗЕЯ ");
  await expect(scene.locator('[data-entity-id="interior"]')).toHaveText(
    "ИНТЕРЬЕР МУЗЕЯ",
  );
  await saved(page);
  await page.reload();
  await expect(scene.locator('[data-entity-id="interior"]')).toHaveText(
    "ИНТЕРЬЕР МУЗЕЯ",
  );
});

for (const prefix of ["д", "дом у м"])
  test(`scene location components complete a ${prefix.length === 1 ? "single-letter" : "multiword"} prefix after INT`, async ({
    page,
  }) => {
    const doc = fixture();
    doc.content.content = [p("scene", `ИНТ. ${prefix}`, "scene")];
    doc.components.push({
      id: "home",
      name: "Дом у моря",
      type: "place",
      color: "#8a799a",
    });
    await seed(page, [doc]);
    const scene = block(page, "scene");
    await caret(page, scene, (await scene.textContent()).length);
    const first = popup(page).getByRole("option").first();
    await expect(first).toContainText("Дом у моря");
    await expect(first.locator('svg[aria-label="Компонент"]')).toBeVisible();
    await page.keyboard.press("Control+Enter");
    await expect(scene).toHaveText("ИНТ. ДОМ У МОРЯ ");
    await expect(scene.locator('[data-entity-id="home"]')).toHaveText(
      "ДОМ У МОРЯ",
    );
  });

for (const dash of ["-", "— "])
  test(`scene ending components are not hidden or duplicated by time-of-day suggestions with ${dash.endsWith(" ") ? "a spaced" : "an unspaced"} dash`, async ({
    page,
  }) => {
    const doc = fixture();
    doc.content.content = [p("scene", `ИНТ. ДОМ ${dash}Н`, "scene")];
    doc.components.push(
      { id: "night", name: "Ночь", type: "place", color: "#8a799a" },
      {
        id: "night-shift",
        name: "Ночная смена",
        type: "place",
        color: "#8a799a",
      },
    );
    await seed(page, [doc]);
    const scene = block(page, "scene");
    await caret(page, scene, (await scene.textContent()).length);
    await expect(popup(page).getByRole("option")).toHaveCount(2);
    const first = popup(page).getByRole("option").first();
    await expect(first).toContainText("Ночь");
    await expect(first.locator('svg[aria-label="Компонент"]')).toBeVisible();
    await expect(
      popup(page).getByText("Ночная смена", { exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Control+Enter");
    await expect(scene).toHaveText(`ИНТ. ДОМ ${dash.trim()} НОЧЬ `);
    await expect(scene.locator('[data-entity-id="night"]')).toHaveText("НОЧЬ");
  });

test("scene ending suggestion adds a space only when the dash has none", async ({
  page,
}) => {
  const doc = fixture();
  doc.content.content = [p("scene", "ИНТ. ДОМ -Д", "scene")];
  await seed(page, [doc]);
  const scene = block(page, "scene");
  await caret(page, scene, (await scene.textContent()).length);
  await expect(popup(page).getByRole("option").first()).toContainText("ДЕНЬ");
  await page.keyboard.press("Control+Enter");
  await expect(scene).toHaveText("ИНТ. ДОМ - ДЕНЬ ");

  await caret(page, scene, 0, (await scene.textContent()).length);
  await page.keyboard.insertText("ИНТ. ДОМ - Д");
  await expect(popup(page).getByRole("option").first()).toContainText("ДЕНЬ");
  await page.keyboard.press("Control+Enter");
  await expect(scene).toHaveText("ИНТ. ДОМ - ДЕНЬ ");
});

test("bold italic and underline work from selection toolbar and survive reload", async ({
  page,
}) => {
  await seed(page);
  await caret(page, block(page), 0, 4);
  for (const name of ["Жирный", "Курсив", "Подчёркнутый"])
    await page.getByRole("button", { name, exact: true }).click();
  await expect(
    block(page).locator(
      "strong em u, strong u em, em strong u, em u strong, u strong em, u em strong",
    ),
  ).toHaveText("Анна");
  await saved(page);
  await page.reload();
  await expect(block(page).locator("strong")).toHaveText("Анна");
  await expect(block(page).locator("em")).toHaveText("Анна");
  await expect(block(page).locator("u")).toHaveText("Анна");
  await caret(page, block(page), 0, 4);
  await page.keyboard.press("Control+b");
  await expect(block(page).locator("strong")).toHaveCount(0);
});

test("Ctrl+D creates a component from the selected screenplay text", async ({
  page,
}) => {
  await seed(page);
  await caret(page, block(page), 5, 12);
  const component = page.getByRole("button", {
    name: "Создать компонент из выделения",
  });
  await expect(component).toHaveAttribute(
    "aria-keyshortcuts",
    "Control+D Meta+D",
  );
  await expect(component.locator(".selection-shortcut")).toHaveText("CTRL + D");
  await page.keyboard.press("Control+d");
  const panel = page.getByRole("complementary", {
    name: "Компоненты сценария",
  });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(panel.getByRole("textbox", { name: "Название" })).toHaveValue(
    "смотрит",
  );
  await panel.getByRole("textbox", { name: /Описание/ }).fill("Взгляд в окно");
  await page.keyboard.press("Control+Enter");
  const mention = block(page)
    .locator("[data-entity-id]")
    .filter({ hasText: /^смотрит$/ });
  await expect(mention).toHaveText("смотрит");
  await expect(panel).toBeVisible();
  await expect(mention).toHaveCSS("color", "rgb(138, 121, 154)");
  await panel.getByRole("button", { name: "Закрыть компоненты" }).click();
  await expect(mention).toHaveCSS("color", "rgb(27, 46, 255)");
});

test("Ctrl+D works with a Russian layout and opens an existing component", async ({
  page,
}) => {
  const doc = fixture();
  doc.componentFolders = [{ id: "cast", name: "Актёры" }];
  doc.collapsedComponentFolders = ["cast"];
  doc.components[0].folderId = "cast";
  await seed(page, [doc]);
  await block(page).evaluate((element) => {
    const editor = element.closest("[contenteditable]");
    editor.focus();
    const range = document.createRange();
    const text = document
      .createTreeWalker(element, NodeFilter.SHOW_TEXT)
      .nextNode();
    range.setStart(text, 0);
    range.setEnd(text, 4);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    editor.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "в",
        code: "KeyD",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  const panel = page.getByRole("complementary", {
    name: "Компоненты сценария",
  });
  await expect(panel).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Папка: Актёры" }),
  ).toHaveAttribute("aria-expanded", "true");
  await expect(panel.getByLabel("Название", { exact: true })).toHaveValue(
    "Анна",
  );
  await expect(
    page.getByRole("dialog", { name: "Новый компонент" }),
  ).toHaveCount(0);
  await expect(block(page).locator('[data-entity-id="anna"]')).toHaveText(
    "Анна",
  );
  await panel.getByRole("button", { name: "Закрыть компоненты" }).click();
  await caret(page, block(page), 0, 4);
  await page.keyboard.press("Control+d");
  await expect(panel.getByLabel("Название", { exact: true })).toHaveValue(
    "Анна",
  );
});

test("resolved comments ignore document clicks while open comments still open after reload", async ({
  page,
}) => {
  await seed(page);
  await caret(page, block(page), 5, 18);
  await page.getByRole("button", { name: "Комментировать выделение" }).click();
  await page.getByLabel("Текст комментария").fill("Здесь нужна пауза.");
  await page.getByRole("button", { name: "Добавить", exact: true }).click();
  await expect(block(page).locator("[data-comment-id]")).toHaveText(
    "смотрит в окн",
  );
  const panel = page.getByRole("complementary", {
    name: "Комментарии сценария",
  });
  await panel.getByRole("button", { name: "Закрыть комментарии" }).click();
  await block(page).locator("[data-comment-id]").click();
  await expect(panel).toContainText("Здесь нужна пауза.");
  await page.getByRole("button", { name: "Решено", exact: true }).click();
  await expect(block(page).locator("[data-comment-id]")).toHaveCSS(
    "cursor",
    "text",
  );
  await panel.getByRole("button", { name: "Закрыть комментарии" }).click();
  await block(page).locator("[data-comment-id]").click();
  await expect(panel).toHaveCount(0);
  await expect(editor(page)).toBeFocused();
  await saved(page);
  await page.reload();
  await block(page).locator("[data-comment-id]").click();
  await expect(panel).toHaveCount(0);
  await page.getByRole("button", { name: "Комментарии", exact: true }).click();
  await page.getByRole("button", { name: "Решённые", exact: true }).click();
  await expect(
    page.getByRole("complementary", { name: "Комментарии сценария" }),
  ).toContainText("Здесь нужна пауза.");
  await page
    .getByRole("button", { name: "Открыть снова", exact: true })
    .click();
  await saved(page);
  await page.reload();
  await block(page).locator("[data-comment-id]").click();
  await expect(
    page.getByRole("complementary", { name: "Комментарии сценария" }),
  ).toContainText("Здесь нужна пауза.");
});

test("overlapping comment marks only open an unresolved comment", async ({
  page,
}) => {
  const doc = fixture();
  doc.comments = [false, true].map((resolved) => ({
    id: resolved ? "resolved" : "open",
    text: resolved ? "Уже решён" : "Ещё открыт",
    quote: "Анна",
    blockId: "action",
    resolved,
    createdAt: doc.updatedAt,
  }));
  doc.content.content[1].content = [
    {
      type: "text",
      text: "Анна",
      marks: doc.comments.map((comment) => ({
        type: "comment",
        attrs: { id: comment.id },
      })),
    },
    { type: "text", text: " смотрит в окно." },
  ];
  await seed(page, [doc]);
  const panel = page.getByRole("complementary", {
    name: "Комментарии сценария",
  });
  await block(page).locator('[data-comment-id="resolved"]').click();
  await expect(panel.locator(".comment-card.active")).toContainText(
    "Ещё открыт",
  );
  await expect(panel).not.toContainText("Уже решён");
  await panel.getByRole("button", { name: "Решено", exact: true }).click();
  await panel.getByRole("button", { name: "Закрыть комментарии" }).click();
  await block(page).locator('[data-comment-id="resolved"]').click();
  await expect(editor(page)).toBeFocused();
  await expect(panel).toHaveCount(0);
});

test("selecting a comment card changes only its text highlight and resolved marks use a text cursor", async ({
  page,
}, testInfo) => {
  const doc = fixture();
  doc.comments = [
    {
      id: "anna-note",
      quote: "Анна",
      text: "Проверить персонажа",
      blockId: "action",
    },
    {
      id: "lamp-note",
      quote: "лампа",
      text: "Проверить освещение",
      blockId: "action",
    },
    {
      id: "resolved-note",
      quote: "Я всё ещё помню этот берег.",
      text: "Уже проверено",
      blockId: "speech",
      resolved: true,
    },
  ].map((comment) => ({
    createdAt: doc.updatedAt,
    resolved: false,
    ...comment,
  }));
  const marked = (text, id) => ({
    type: "text",
    text,
    marks: [{ type: "comment", attrs: { id } }],
  });
  doc.content.content[1].content = [
    marked("Анна", "anna-note"),
    { type: "text", text: " смотрит в окно. На столе горит " },
    marked("лампа", "lamp-note"),
    { type: "text", text: "." },
  ];
  doc.content.content[4].content = [
    marked(doc.comments[2].quote, "resolved-note"),
  ];
  doc.content.content[6].content = [marked("Конец.", "missing-note")];
  await seed(page, [doc]);
  const panel = page.getByRole("complementary", {
    name: "Комментарии сценария",
  });
  const anna = block(page).locator(
    '[data-comment-id="anna-note"] .comment-open',
  );
  const lamp = block(page).locator(
    '[data-comment-id="lamp-note"] .comment-open',
  );
  const resolved = block(page, "speech").locator("[data-comment-id]");
  await expect(anna).toHaveCSS("cursor", "pointer");
  await expect(resolved).toHaveCSS("cursor", "text");
  await expect(block(page, "plain").locator("[data-comment-id]")).toHaveCSS(
    "cursor",
    "text",
  );
  await page.getByRole("button", { name: "Комментарии", exact: true }).click();
  await panel
    .locator(".comment-card")
    .filter({ hasText: "Проверить персонажа" })
    .click();
  await expect(anna).toHaveCSS("background-color", "rgb(255, 225, 166)");
  await expect(lamp).toHaveCSS("background-color", "rgb(245, 237, 204)");
  await expect(panel.locator(".comment-card.active")).toHaveCSS(
    "background-color",
    "rgb(247, 243, 251)",
  );
  await panel
    .locator(".comment-card")
    .filter({ hasText: "Проверить освещение" })
    .click();
  await expect(anna).toHaveCSS("background-color", "rgb(245, 237, 204)");
  await expect(lamp).toHaveCSS("background-color", "rgb(255, 225, 166)");
  await page.screenshot({ path: testInfo.outputPath("comment-selection.png") });
  await panel.getByRole("button", { name: "Решённые", exact: true }).click();
  await panel.locator(".comment-card").click();
  await expect(resolved.locator(".comment-resolved-selected")).toHaveCSS(
    "background-color",
    "rgb(228, 240, 229)",
  );
  await expect(resolved.locator(".comment-resolved-selected")).toHaveCSS(
    "cursor",
    "text",
  );
  await expect(editor(page).locator(".comment-open-selected")).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("resolved-comment-review.png"),
  });
  await panel.getByRole("button", { name: "Закрыть комментарии" }).click();
  await expect(resolved).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(anna).toHaveCSS("background-color", "rgb(245, 237, 204)");
});

test("search spans text marks and navigates case-insensitive matches", async ({
  page,
}) => {
  const doc = fixture();
  doc.content.content[1].content = [
    { type: "text", text: "Анна " },
    { type: "text", text: "смотрит", marks: [{ type: "bold" }] },
    { type: "text", text: " в окно. Анна смотрит на часы." },
  ];
  await seed(page, [doc]);
  await page.keyboard.press("Control+f");
  await page
    .getByRole("textbox", { name: "Поиск по тексту" })
    .fill("анна смотрит");
  await expect(page.locator(".search-count")).toHaveText("1 / 2");
  await expect
    .poll(async () =>
      (await editor(page).locator(".search-is-current").allTextContents()).join(
        "",
      ),
    )
    .toBe("Анна смотрит");
  await page.getByRole("textbox", { name: "Поиск по тексту" }).press("Enter");
  await expect(page.locator(".search-count")).toHaveText("2 / 2");
  await expect(
    editor(page).locator(".script-search-result").first(),
  ).toBeVisible();
  await page.locator(".search-result-card").first().click();
  await expect
    .poll(async () =>
      (await editor(page).locator(".search-from-card").allTextContents()).join(
        "",
      ),
    )
    .toBe("Анна смотрит");
  await expect(editor(page).locator(".search-from-card").first()).toHaveCSS(
    "background-color",
    "rgb(255, 202, 133)",
  );
  await page.getByRole("button", { name: "Следующее совпадение" }).click();
  await expect(editor(page).locator(".search-from-card")).toHaveCount(0);
  await page.getByRole("textbox", { name: "Поиск по тексту" }).press("Escape");
  await expect(page.getByRole("search")).toHaveCount(0);
  await expect(editor(page).locator(".script-search-result")).toHaveCount(0);
});

test("a search result card scrolls to and highlights a distant match", async ({
  page,
}) => {
  const doc = fixture();
  doc.content.content = [
    p("scene", "ИНТ. МАЯК — ДЕНЬ", "scene"),
    p("action", "Первый маяк виден издалека.", "near"),
    ...Array.from({ length: 80 }, (_, i) =>
      p("action", `Проходит сцена номер ${i + 1}.`, `middle-${i}`),
    ),
    p("action", "Второй маяк появляется на горизонте.", "far"),
  ];
  await seed(page, [doc]);
  await page.keyboard.press("Control+f");
  const search = page.getByRole("complementary", { name: "Поиск по сценарию" });
  await search.getByRole("textbox", { name: "Поиск по тексту" }).fill("маяк");
  await expect(search.locator(".search-result-card")).toHaveCount(3);
  const scroller = page.locator(".minimal-scroll");
  const before = await scroller.evaluate((el) => el.scrollTop);
  await search.locator(".search-result-card").last().click();
  const selected = block(page, "far").locator(".search-from-card");
  await expect(selected).toHaveText("маяк");
  await expect
    .poll(() => scroller.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(before + 1000);
  await expect
    .poll(() =>
      selected.evaluate((el) => {
        const match = el.getBoundingClientRect();
        const viewport = el.closest(".minimal-scroll").getBoundingClientRect();
        return match.top > viewport.top && match.bottom < viewport.bottom;
      }),
    )
    .toBe(true);
});

test("onboarding introduces all features and can be reopened from help", async ({
  page,
}) => {
  await seed(page);
  const dialog = page.getByRole("dialog", { name: "Знакомство с редактором" });
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 7; i++)
    await dialog.getByRole("button", { name: "Далее", exact: true }).click();
  await expect(dialog).toContainText("Ваши файлы остаются у вас");
  await dialog.getByRole("button", { name: "Далее", exact: true }).click();
  await expect(dialog).toContainText("Соберите историю в аутлайне");
  await dialog.getByRole("button", { name: "Начать писать" }).click();
  await page.reload();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Обучение", exact: true }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Закрыть обучение" }).click();
});

test("saved status writes latest document before asking the local app to open its folder", async ({
  page,
}) => {
  const calls = [];
  await page.route("**/__tyter_local/**", async (route) => {
    calls.push({
      url: route.request().url(),
      body: route.request().postDataJSON(),
    });
    await route.fulfill({
      json: { documents: [], directory: "Test documents" },
    });
  });
  await seed(page);
  await replaceAction(page, "Последняя версия.");
  await page.getByRole("button", { name: "Открыть папку сценариев" }).click();
  await expect
    .poll(() => calls.filter((c) => c.url.endsWith("/open-folder")).length)
    .toBe(1);
  const opened = calls.findIndex((c) => c.url.endsWith("/open-folder"));
  expect(
    calls[opened - 1].body.documents[0].content.content[1].content[0].text,
  ).toBe("Последняя версия.");
});

test("inline emphasis is retained in DOCX, PDF and FDX downloads", async ({
  page,
}, testInfo) => {
  const doc = fixture();
  doc.content.content[1].content = [
    {
      type: "text",
      text: "Анна",
      marks: [{ type: "bold" }, { type: "italic" }, { type: "underline" }],
    },
    { type: "text", text: " смотрит в окно." },
  ];
  await seed(page, [doc]);
  const fdx = await download(
    page,
    /Final Draft · FDX/,
    "Тихий берег.fdx",
    testInfo,
  );
  expect(fdx.bytes.toString("utf8")).toContain(
    '<Text Style="Bold+Italic+Underline">Анна</Text>',
  );
  const docx = await download(
    page,
    /Word · DOCX/,
    "Тихий берег.docx",
    testInfo,
  );
  const xml = strFromU8(unzipSync(docx.bytes)["word/document.xml"]);
  expect(xml).toContain("<w:i/>");
  expect(xml).toContain('<w:u w:val="single"/>');
  const pdf = await download(
    page,
    /PDF Для чтения/,
    "Тихий берег.pdf",
    testInfo,
  );
  const stream = pdf.bytes
    .toString("latin1")
    .match(/stream\r?\n([\s\S]*?)\r?\nendstream/)[1];
  const commands = inflateSync(Buffer.from(stream, "latin1")).toString(
    "latin1",
  );
  expect(commands).toContain("/F18 12 Tf");
  expect(commands).toContain(" l\nS");
  await page.locator("input[type=file]").setInputFiles(fdx.path);
  await expect(editor(page).locator("em")).toHaveText("Анна");
  await expect(editor(page).locator("u")).toHaveText("Анна");
});

test("component folders, search and editing an existing selected component persist", async ({
  page,
}) => {
  await seed(page);
  await page.getByRole("button", { name: "Компоненты", exact: true }).click();
  const panel = page.getByRole("complementary", {
    name: "Компоненты сценария",
  });
  await panel
    .getByRole("button", { name: "Создать папку компонентов" })
    .click();
  await panel
    .getByRole("textbox", { name: "Название папки" })
    .fill("Главные герои");
  await panel
    .getByRole("button", { name: "Добавить папку", exact: true })
    .click();
  const componentScroll = await panel
    .locator(".component-folders")
    .evaluate((el) => ({
      visible: el.clientWidth,
      content: el.scrollWidth,
    }));
  expect(componentScroll.content).toBeLessThanOrEqual(componentScroll.visible);
  await panel.getByRole("button", { name: /Анна Главная/ }).click();
  await panel
    .getByLabel("Папка", { exact: true })
    .selectOption({ label: "Главные герои" });
  await panel.getByRole("button", { name: "Сохранить", exact: true }).click();
  const anna = panel.locator(".component-item").filter({ hasText: "Анна" });
  await anna.click();
  await expect(anna).toHaveAttribute("aria-expanded", "true");
  await expect(anna.locator(".component-arrow")).toHaveCSS(
    "transform",
    "matrix(-1, 0, 0, -1, 0, 0)",
  );
  await expect(panel.getByLabel("Название", { exact: true })).toBeVisible();
  await anna.click();
  await expect(anna).toHaveAttribute("aria-expanded", "false");
  await expect(panel.getByLabel("Название", { exact: true })).toHaveCount(0);
  await panel
    .getByRole("button", { name: "Папка: Главные герои", exact: true })
    .click();
  await expect(panel.getByRole("button", { name: /Анна Главная/ })).toHaveCount(
    0,
  );
  await panel.getByRole("textbox", { name: "Поиск компонентов" }).fill("Анна");
  await expect(
    panel.getByRole("button", { name: /Анна Главная/ }),
  ).toBeVisible();
  await panel.getByRole("textbox", { name: "Поиск компонентов" }).fill("");
  await caret(page, block(page), 0, 4);
  await page
    .getByRole("button", { name: "Создать компонент из выделения" })
    .click();
  await expect(panel.getByLabel("Название", { exact: true })).toHaveValue(
    "Анна",
  );
  await expect(
    panel.getByRole("button", { name: "Папка: Главные герои", exact: true }),
  ).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByRole("dialog", { name: "Новый компонент" }),
  ).toHaveCount(0);
  await panel
    .getByLabel("Описание", { exact: false })
    .fill("Изменённое описание");
  await panel.getByRole("button", { name: "Сохранить", exact: true }).click();
  await saved(page);
  await page.reload();
  await page.getByRole("button", { name: "Компоненты", exact: true }).click();
  await expect(panel).toContainText("Изменённое описание");
  await expect(
    panel.getByRole("button", { name: "Обучение компонентам" }),
  ).toHaveCount(0);
});

test("Ctrl+left click on linked text opens its component for editing", async ({
  page,
}) => {
  const doc = fixture();
  doc.content.content[1].content = [
    {
      type: "text",
      text: "Анна",
      marks: [{ type: "entity", attrs: { id: "anna", color: "#8a799a" } }],
    },
    { type: "text", text: " смотрит в окно." },
  ];
  await seed(page, [doc]);
  const linked = block(page).locator('[data-entity-id="anna"]');
  await linked.click();
  await expect(
    page.getByRole("complementary", { name: "Компоненты сценария" }),
  ).toHaveCount(0);
  await linked.click({ button: "left", modifiers: ["Control"] });
  const panel = page.getByRole("complementary", {
    name: "Компоненты сценария",
  });
  await expect(panel).toBeVisible();
  await expect(panel.getByLabel("Название", { exact: true })).toHaveValue(
    "Анна",
  );
  await expect(
    panel.locator('[data-component-id="anna"] .component-item'),
  ).toHaveAttribute("aria-expanded", "true");
});

test("resolved comments hide yellow marks and preview surviving and deleted quote text", async ({
  page,
}) => {
  await seed(page);
  const original = await block(page).textContent();
  await caret(page, block(page), 0, original.length);
  await page.getByRole("button", { name: "Комментировать выделение" }).click();
  await page
    .getByRole("textbox", { name: "Текст комментария" })
    .fill("Проверить глагол");
  await page.getByRole("button", { name: "Добавить", exact: true }).click();
  expect(
    (await block(page).locator(".comment-open").allTextContents()).join(""),
  ).toBe(original);
  await page.getByRole("button", { name: "Закрыть комментарии" }).click();
  await caret(page, block(page), 5, 12);
  await page.keyboard.press("Backspace");
  await page.getByRole("button", { name: "Комментарии", exact: true }).click();
  await page.getByRole("button", { name: "Решено", exact: true }).click();
  await expect(block(page).locator(".comment-open")).toHaveCount(0);
  await expect(block(page).locator(".comment-resolved-selected")).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Решённые", exact: true }).click();
  await page.locator(".comment-quote").click();
  await expect(
    block(page).locator(".comment-resolved-selected").first(),
  ).toBeVisible();
  await expect(block(page).locator(".comment-deleted-text")).toContainText(
    "смотрит",
  );
  await saved(page);
  const text = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("tyter.projects.v1"))[0]
      .content.content[1].content.map((n) => n.text || "")
      .join(""),
  );
  expect(text).not.toContain("смотрит");
  await page.getByRole("button", { name: "Закрыть комментарии" }).click();
  await expect(block(page).locator(".comment-deleted-text")).toHaveCount(0);
});

test("settings persist and Ctrl wheel zooms the whole document within 100–200%", async ({
  page,
}) => {
  await seed(page);
  await page
    .getByRole("button", { name: "Настройки документа", exact: true })
    .click();
  const panel = page.getByRole("complementary", {
    name: "Настройки документа",
  });
  await panel
    .getByRole("textbox", { name: "Автор", exact: true })
    .fill("Ирина Петрова");
  await panel.getByRole("textbox", { name: "Год", exact: true }).fill("2026");
  await panel
    .getByRole("textbox", { name: "Email автора" })
    .fill("irina@example.com");
  await panel.locator('input[type="file"]').setInputFiles({
    name: "poster.png",
    mimeType: "image/png",
    buffer: await page.screenshot({
      clip: { x: 0, y: 0, width: 20, height: 30 },
    }),
  });
  await expect(panel.getByAltText("Обложка сценария")).toBeVisible();
  await expect(
    panel.getByRole("slider", { name: "Размер шрифта" }),
  ).toHaveCount(0);
  await panel.getByRole("slider", { name: "Масштаб документа" }).fill("200");
  await expect(page.locator(".script-paper")).toHaveCSS("zoom", "2");
  await expect(editor(page)).toHaveCSS("font-size", "16px");
  await page
    .locator(".script-paper")
    .dispatchEvent("wheel", { ctrlKey: true, deltaY: -100, bubbles: true });
  await expect(panel.getByRole("slider")).toHaveValue("200");
  await panel.getByRole("slider").fill("100");
  await page
    .locator(".script-paper")
    .dispatchEvent("wheel", { ctrlKey: true, deltaY: 100, bubbles: true });
  await expect(panel.getByRole("slider")).toHaveValue("100");
  await page
    .locator(".script-paper")
    .dispatchEvent("wheel", { ctrlKey: true, deltaY: -100, bubbles: true });
  await expect(panel.getByRole("slider")).toHaveValue("110");
  await saved(page);
  await page.reload();
  await page
    .getByRole("button", { name: "Настройки документа", exact: true })
    .click();
  await expect(
    panel.getByRole("textbox", { name: "Автор", exact: true }),
  ).toHaveValue("Ирина Петрова");
  await expect(panel.getByRole("slider")).toHaveValue("110");
  await expect(panel.getByAltText("Обложка сценария")).toBeVisible();
});

test("page guides, runtime and centered floating bar follow the paper beside full-height sidebars", async ({
  page,
}, testInfo) => {
  const doc = fixture();
  doc.content.content = Array.from({ length: 65 }, (_, i) =>
    p(
      "action",
      "Анна смотрит в окно. На столе горит лампа. ".repeat(4),
      `paragraph-${i}`,
    ),
  );
  await seed(page, [doc]);
  await expect
    .poll(() => page.locator(".page-guide").count())
    .toBeGreaterThan(2);
  await page
    .getByRole("button", { name: "Статистика документа", exact: true })
    .click();
  const count = await page.locator(".page-guide").count();
  const stats = page.getByRole("complementary", {
    name: "Статистика документа",
  });
  await expect(
    stats.locator(".statistics-rows > div").filter({ hasText: "Хронометраж" }),
  ).toContainText(`${count} мин`);
  const paper = await page.locator(".script-paper").boundingBox(),
    bar = await page.locator(".screenplay-format-bar").boundingBox(),
    sidebar = await stats.boundingBox();
  expect(
    Math.abs(paper.x + paper.width / 2 - bar.x - bar.width / 2),
  ).toBeLessThan(8);
  expect(sidebar.y + sidebar.height).toBe(1000);
  await expect(page.locator(".minimal-footer")).toHaveCSS("z-index", "10000");
  await page.screenshot({
    path: testInfo.outputPath("pages-and-statistics.png"),
  });
  await page.keyboard.press("Control+f");
  const search = page.getByRole("complementary", { name: "Поиск по сценарию" });
  await search.getByRole("textbox", { name: "Поиск по тексту" }).fill("лампа");
  await expect(search.locator(".search-result-card")).toHaveCount(260);
  await search.locator(".search-result-card").nth(7).click();
  await expect(editor(page).locator(".search-is-current")).toHaveText("лампа");
  await page.screenshot({ path: testInfo.outputPath("search-sidebar.png") });
});

test("document limit opens Pro information and deleting a document allows a new one", async ({
  page,
}) => {
  await seed(page, [
    fixture(),
    { ...fixture(), id: "second", title: "Второй сценарий" },
  ]);
  await page.getByRole("button", { name: "Документы", exact: true }).click();
  await page
    .getByRole("button", { name: "Новый сценарий", exact: true })
    .click();
  const subscription = page.getByRole("dialog", {
    name: "Полная версия Tyter",
  });
  await expect(subscription).toContainText("доната на Boosty");
  await expect(subscription.locator(".dialog-heading h2")).toHaveText(
    "Tyter Pro",
  );
  await expect(subscription.locator(":scope > h2")).toHaveCount(0);
  await expect(subscription).toContainText(
    "Вся история изменений без ограничения срока",
  );
  await expect(
    subscription.getByRole("textbox", { name: "Email", exact: true }),
  ).toHaveCount(0);
  await expect(
    subscription.getByRole("link", { name: "Открыть Tyter Pro" }),
  ).toHaveAttribute("href", "/beta");
  await subscription.getByRole("button", { name: "Закрыть подписку" }).click();
  await page.getByRole("button", { name: "Документы", exact: true }).click();
  await page
    .locator('.document-row[data-document-id="document-test"] .document-more')
    .click();
  await page
    .getByRole("button", { name: "Удалить документ", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Удалить документ?" })
    .getByRole("button", { name: "Удалить", exact: true })
    .click();
  await saved(page);
  await page.reload();
  await page.getByRole("button", { name: "Документы", exact: true }).click();
  await expect(
    page.locator(".document-item").filter({ hasText: "Тихий берег" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Новый сценарий", exact: true })
    .click();
  await expect(subscription).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Документы", exact: true }),
  ).toContainText("Без названия");
});

test("legacy libraries larger than two retain two new free slots", async ({
  page,
}) => {
  await seed(page, [
    fixture(),
    { ...fixture(), id: "older-2", title: "Второй старый сценарий" },
    { ...fixture(), id: "older-3", title: "Третий старый сценарий" },
  ]);
  for (let count = 0; count < 2; count++) {
    await page.getByRole("button", { name: "Документы", exact: true }).click();
    await page
      .getByRole("button", { name: "Новый сценарий", exact: true })
      .click();
  }
  await saved(page);
  await page.reload();
  await page.getByRole("button", { name: "Документы", exact: true }).click();
  await expect(
    page
      .locator(".document-item")
      .filter({ hasText: "Второй старый сценарий" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Новый сценарий", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Полная версия Tyter" }),
  ).toBeVisible();
});

for (const format of ["DOCX", "PDF"])
  test(`${format} import reads the exported screenplay`, async ({
    page,
  }, testInfo) => {
    await seed(page);
    const { path } = await download(
      page,
      format === "DOCX" ? /Word · DOCX/ : /PDF Для/,
      `Тихий берег.${format.toLowerCase()}`,
      testInfo,
    );
    await page
      .locator('input[type="file"][accept*=".fdx"]')
      .setInputFiles(path);
    await expect(
      page.getByRole("button", { name: "Документы", exact: true }),
    ).toContainText("Тихий берег");
    await expect
      .poll(
        () =>
          page.evaluate(
            () => JSON.parse(localStorage.getItem("tyter.projects.v1")).length,
          ),
        { timeout: 20000 },
      )
      .toBe(2);
    await expect(editor(page)).toContainText("Анна");
    await expect(editor(page)).toContainText("берег");
  });

test("long paragraphs paginate without changing text or placing lines on page separators", async ({
  page,
}, testInfo) => {
  const doc = fixture();
  const text = "Анна смотрит в окно. На столе горит лампа. ".repeat(300);
  doc.content.content = [p("action", text, "long")];
  await seed(page, [doc]);
  await expect
    .poll(() => page.locator(".page-guide").count())
    .toBeGreaterThan(2);
  await expect(block(page, "long")).toHaveText(text);
  const crossing = await block(page, "long").evaluate((el) => {
    const origin = el.closest(".script-paper").getBoundingClientRect().top;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const result = [];
    let node;
    while ((node = walker.nextNode())) {
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) {
        const top = rect.top - origin,
          bottom = rect.bottom - origin;
        if (top % 1056 < 75 || bottom % 1056 > 980)
          result.push({ top, bottom });
      }
    }
    return result;
  });
  expect(crossing).toEqual([]);
  await page.locator(".minimal-scroll").evaluate((el) => {
    el.scrollTop = 830;
  });
  await page.screenshot({
    path: testInfo.outputPath("long-paragraph-page-break.png"),
  });
});

test("component rename changes every linked mention and custom folders can be deleted", async ({
  page,
}) => {
  const doc = fixture();
  const mark = { type: "entity", attrs: { id: "anna", color: "#8a799a" } };
  doc.content.content[1].content = [
    { type: "text", text: "Анна", marks: [mark] },
    { type: "text", text: " видит, как " },
    { type: "text", text: "Анна", marks: [mark] },
    { type: "text", text: " уходит. Анна остаётся." },
  ];
  await seed(page, [doc]);
  await page.getByRole("button", { name: "Компоненты", exact: true }).click();
  const panel = page.getByRole("complementary", {
    name: "Компоненты сценария",
  });
  await panel
    .getByRole("button", { name: "Создать папку компонентов" })
    .click();
  await panel.getByRole("textbox", { name: "Название папки" }).fill("Герои");
  await panel.getByRole("button", { name: "Добавить папку" }).click();
  await panel.getByRole("button", { name: /Анна Главная/ }).click();
  await expect(panel.getByLabel("Тип", { exact: true })).toHaveCount(0);
  await panel
    .getByLabel("Папка", { exact: true })
    .selectOption({ label: "Герои" });
  await panel.getByLabel("Название", { exact: true }).fill("Мария");
  await panel.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(block(page).locator('[data-entity-id="anna"]')).toHaveCount(3);
  await expect(block(page)).toHaveText(
    "Мария видит, как Мария уходит. Мария остаётся.",
  );
  await panel.getByRole("button", { name: "Удалить папку: Герои" }).click();
  const folderDialog = page.getByRole("dialog", { name: "Удалить папку?" });
  await expect(
    folderDialog.getByRole("checkbox", { name: "Удалить компоненты в папке" }),
  ).not.toBeChecked();
  await folderDialog.getByRole("button", { name: "Удалить папку" }).click();
  await expect(panel.getByRole("button", { name: "Папка: Герои" })).toHaveCount(
    0,
  );
  await expect(
    panel.getByRole("button", { name: /Мария Главная/ }),
  ).toBeVisible();
  await expect(block(page).locator('[data-entity-id="anna"]')).toHaveCount(3);
  await saved(page);
  await page.reload();
  await expect(block(page)).toHaveText(
    "Мария видит, как Мария уходит. Мария остаётся.",
  );
});

test("folder deletion can remove its components and linked marks as one undoable action", async ({
  page,
}) => {
  const doc = fixture();
  doc.componentFolders = [{ id: "cast", name: "Актёры" }];
  doc.components = doc.components.map((component) => ({
    ...component,
    folderId: "cast",
  }));
  doc.content.content[1].content = [
    {
      type: "text",
      text: "Анна",
      marks: [{ type: "entity", attrs: { id: "anna", color: "#8a799a" } }],
    },
    { type: "text", text: " встречает " },
    {
      type: "text",
      text: "Ивана",
      marks: [{ type: "entity", attrs: { id: "ivan", color: "#8a799a" } }],
    },
    { type: "text", text: "." },
  ];
  await seed(page, [doc]);
  await page.getByRole("button", { name: "Компоненты", exact: true }).click();
  const panel = page.getByRole("complementary", {
    name: "Компоненты сценария",
  });
  await panel.getByRole("button", { name: "Удалить папку: Актёры" }).click();
  const dialog = page.getByRole("dialog", { name: "Удалить папку?" });
  const checkbox = dialog.getByRole("checkbox", {
    name: "Удалить компоненты в папке",
  });
  await expect(checkbox).not.toBeChecked();
  await checkbox.check();
  await dialog.getByRole("button", { name: "Удалить папку" }).click();
  await expect(
    panel.getByRole("button", { name: "Папка: Актёры" }),
  ).toHaveCount(0);
  await expect(panel.locator("[data-component-id]")).toHaveCount(0);
  await expect(block(page)).toHaveText("Анна встречает Ивана.");
  await expect(block(page).locator("[data-entity-id]")).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect(
    panel.getByRole("button", { name: "Папка: Актёры" }),
  ).toBeVisible();
  await expect(panel.locator("[data-component-id]")).toHaveCount(2);
  await expect(block(page).locator("[data-entity-id]")).toHaveCount(2);
  await page.keyboard.press("Control+y");
  await expect(panel.locator("[data-component-id]")).toHaveCount(0);
  await saved(page);
  await page.reload();
  await page.getByRole("button", { name: "Компоненты", exact: true }).click();
  await expect(panel.locator("[data-component-id]")).toHaveCount(0);
  await expect(block(page)).toHaveText("Анна встречает Ивана.");
});

test("Ctrl+Z restores a deleted component and its linked text", async ({
  page,
}) => {
  const doc = fixture();
  doc.content.content[1].content = [
    {
      type: "text",
      text: "Анна",
      marks: [{ type: "entity", attrs: { id: "anna", color: "#8a799a" } }],
    },
    { type: "text", text: " смотрит в окно." },
  ];
  await seed(page, [doc]);
  await page.getByRole("button", { name: "Компоненты", exact: true }).click();
  const panel = page.getByRole("complementary", {
    name: "Компоненты сценария",
  });
  await panel.getByRole("button", { name: /Анна Главная/ }).click();
  await panel.getByRole("button", { name: "Удалить компонент" }).click();
  await expect(panel.getByRole("button", { name: /Анна Главная/ })).toHaveCount(
    0,
  );
  await expect(block(page).locator('[data-entity-id="anna"]')).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect(
    panel.getByRole("button", { name: /Анна Главная/ }),
  ).toBeVisible();
  await expect(block(page).locator('[data-entity-id="anna"]')).toHaveCount(1);
  await page.keyboard.press("Control+y");
  await expect(panel.getByRole("button", { name: /Анна Главная/ })).toHaveCount(
    0,
  );
  await expect(block(page).locator('[data-entity-id="anna"]')).toHaveCount(0);
});

test("Ctrl+Z still undoes ordinary screenplay typing", async ({ page }) => {
  await seed(page);
  const line = block(page);
  const original = await line.textContent();
  await caret(page, line, 0);
  await page.keyboard.type("X");
  await expect(line).toHaveText(`X${original}`);
  await page.keyboard.press("Control+z");
  await expect(line).toHaveText(original);
});

test("component tooltip is singular and stays inside the viewport", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 860, height: 650 });
  await seed(page);
  await page.getByRole("button", { name: "Компоненты", exact: true }).click();
  const panel = page.getByRole("complementary", {
    name: "Компоненты сценария",
  });
  await panel.getByRole("button", { name: /Анна Главная/ }).click();
  const editor = panel.locator(".component-editor");
  await expect(editor).not.toHaveAttribute("title", /.+/);
  await editor.getByRole("button", { name: "Удалить компонент" }).hover();
  const tooltip = page.locator(".unified-tooltip");
  await expect(tooltip).toHaveText("Удалить компонент");
  await expect(tooltip).toHaveCount(1);
  const bounds = await tooltip.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
    };
  });
  expect(bounds.left).toBeGreaterThanOrEqual(0);
  expect(bounds.right).toBeLessThanOrEqual(860);
  expect(bounds.top).toBeGreaterThanOrEqual(0);
  expect(bounds.bottom).toBeLessThanOrEqual(650);
  await page.screenshot({ path: testInfo.outputPath("component-tooltip.png") });
});

test("document zoom enlarges the paper, poster appears in document list, and sidebar controls fit", async ({
  page,
}) => {
  await seed(page, [
    fixture(),
    { ...fixture(), id: "second", title: "Второй сценарий" },
  ]);
  await page.getByRole("button", { name: "Настройки документа" }).click();
  const panel = page.getByRole("complementary", {
    name: "Настройки документа",
  });
  const author = panel.getByRole("textbox", { name: "Автор", exact: true });
  await author.focus();
  const within = await author.evaluate((el) => {
    const field = el.getBoundingClientRect();
    const parent = el.closest("aside").getBoundingClientRect();
    return field.left >= parent.left + 2 && field.right <= parent.right - 2;
  });
  expect(within).toBe(true);
  const before = await page
    .locator(".script-paper")
    .evaluate((el) => el.getBoundingClientRect().height);
  await panel.getByRole("slider", { name: "Масштаб документа" }).fill("200");
  await expect
    .poll(() =>
      page
        .locator(".script-paper")
        .evaluate((el) => el.getBoundingClientRect().height),
    )
    .toBeCloseTo(before * 2, 0);
  await panel.locator('input[type="file"]').setInputFiles({
    name: "poster.png",
    mimeType: "image/png",
    buffer: await page.screenshot({
      clip: { x: 0, y: 0, width: 20, height: 30 },
    }),
  });
  await page.getByRole("button", { name: "Документы", exact: true }).click();
  const firstRow = page.locator(
    '.document-row[data-document-id="document-test"]',
  );
  const poster = firstRow.locator(".document-cover");
  await expect(poster).toBeVisible();
  const posterSource = await poster.getAttribute("src");
  await expect(firstRow.locator(".document-item")).toHaveAttribute(
    "aria-current",
    "true",
  );
  await expect(firstRow.locator(".document-item > svg")).toHaveCount(0);
  await firstRow.locator(".document-item").click();
  await page.getByRole("button", { name: "Документы", exact: true }).click();
  await page
    .locator('.document-row[data-document-id="second"] .document-item')
    .click();
  await page.getByRole("button", { name: "Документы", exact: true }).click();
  await expect(firstRow.locator(".document-cover")).toHaveAttribute(
    "src",
    posterSource,
  );
  await expect(
    page.locator('.document-row[data-document-id="second"] .document-item'),
  ).toHaveAttribute("aria-current", "true");
  await expect(
    page.locator(".document-row .document-item svg.lucide-check"),
  ).toHaveCount(0);
  await saved(page);
  await page.reload();
  await page.getByRole("button", { name: "Документы", exact: true }).click();
  await expect(firstRow.locator(".document-cover")).toHaveAttribute(
    "src",
    posterSource,
  );
});

test("document title uses available header space before truncating", async ({
  page,
}) => {
  const doc = fixture();
  doc.title =
    "Глазами кошки — длинное название сценария для проверки верхней панели";
  await page.setViewportSize({ width: 1440, height: 850 });
  await seed(page, [doc]);
  const title = page.locator(".document-title");
  const fullWidth = await title.evaluate((el) => ({
    width: el.clientWidth,
    content: el.scrollWidth,
  }));
  expect(fullWidth.width).toBeGreaterThan(260);
  expect(fullWidth.content).toBe(fullWidth.width);
  await page.setViewportSize({ width: 900, height: 850 });
  const narrow = await page.locator(".minimal-header").evaluate((header) => {
    const title = header.querySelector(".document-title");
    return {
      width: title.clientWidth,
      content: title.scrollWidth,
      titleRight: title.getBoundingClientRect().right,
      actionsLeft: header
        .querySelector(".document-view-toggle")
        .getBoundingClientRect().left,
    };
  });
  expect(narrow.content).toBeGreaterThan(narrow.width);
  expect(narrow.titleRight).toBeLessThan(narrow.actionsLeft);
});

test("local history survives reload and restores a previous screenplay version", async ({
  page,
}, testInfo) => {
  await seed(page);
  await saved(page);
  await replaceAction(page, "Новая версия действия.");
  await page.getByRole("button", { name: "История изменений" }).click();
  const panel = page.getByRole("complementary", { name: "История изменений" });
  await expect(panel.locator(".history-card")).toHaveCount(1);
  await expect(panel.locator(".history-card")).toContainText("Анна смотрит");
  await saved(page);
  await page.reload();
  await page.getByRole("button", { name: "История изменений" }).click();
  await panel.locator(".history-card").first().click();
  await expect(page.locator(".history-document-preview")).toContainText(
    "Анна смотрит в окно",
  );
  await expect(page.locator(".history-document-preview")).not.toContainText(
    "Новая версия действия",
  );
  await panel.getByRole("button", { name: "Восстановить эту версию" }).click();
  await expect(block(page)).toContainText("Анна смотрит в окно");
  await expect(panel.locator(".history-card")).toHaveCount(2);
  await page.screenshot({ path: testInfo.outputPath("history-sidebar.png") });
});

test("paper and left sidebars align, and selection tooltips and focus states match the UI", async ({
  page,
}, testInfo) => {
  await seed(page);
  const inset = await page
    .locator('.screenplay-block[data-format="scene"]')
    .first()
    .evaluate((el) => {
      const paper = el.closest(".script-paper").getBoundingClientRect();
      return {
        text: Math.round(el.getBoundingClientRect().left - paper.left),
        number: Number.parseFloat(getComputedStyle(el, "::before").left),
      };
    });
  expect(inset).toEqual({ text: 104, number: -64 });

  await page.getByRole("button", { name: "Настройки документа" }).click();
  const panel = page.getByRole("complementary", {
    name: "Настройки документа",
  });
  const right = await panel
    .locator(".settings-scroll")
    .evaluate((el) => el.getBoundingClientRect().right);
  const drawerBounds = await panel.boundingBox();
  expect(drawerBounds.x).toBe(64);
  expect(
    Math.abs(right - drawerBounds.x - drawerBounds.width),
  ).toBeLessThanOrEqual(1);
  const settingsInset = await panel
    .locator(".settings-scroll section")
    .first()
    .evaluate((el) => {
      const child = el.getBoundingClientRect();
      const drawer = el.closest("aside").getBoundingClientRect();
      return [child.left - drawer.left, drawer.right - child.right];
    });
  expect(Math.abs(settingsInset[0] - settingsInset[1])).toBeLessThanOrEqual(3);
  const author = panel.getByRole("textbox", { name: "Автор", exact: true });
  await author.click();
  await expect
    .poll(() => author.evaluate((el) => getComputedStyle(el).outlineStyle))
    .toBe("none");
  await page.keyboard.press("Tab");
  await expect
    .poll(() =>
      page.evaluate(
        () => getComputedStyle(document.activeElement).outlineStyle,
      ),
    )
    .toBe("solid");
  await page.getByRole("button", { name: "Закрыть настройки" }).click();

  for (const [name, selector] of [
    ["Компоненты", ".component-folders"],
    ["Поиск по сценарию", ".search-results"],
    ["Статистика документа", ".statistics-scroll"],
    ["История изменений", ".history-scroll"],
    ["Комментарии", ".comment-list"],
  ]) {
    await page.getByRole("button", { name, exact: true }).click();
    const edge = await page.locator(selector).evaluate((el) => ({
      right: el.getBoundingClientRect().right,
      drawerRight: el.closest("aside").getBoundingClientRect().right,
    }));
    expect(Math.abs(edge.right - edge.drawerRight), name).toBeLessThanOrEqual(
      1,
    );
  }
  await page.getByRole("button", { name: "Закрыть комментарии" }).click();

  await caret(page, block(page), 0, 4);
  const bold = page.getByRole("button", { name: "Жирный", exact: true });
  await bold.hover();
  await expect(bold.locator(".selection-shortcut")).toHaveText("CTRL + B");
  await expect(page.locator(".unified-tooltip")).toHaveText("CTRL + B");
  await expect(bold).not.toHaveAttribute("title", /.+/);
  await bold.click();
  await expect(bold).toHaveAttribute("aria-pressed", "true");
  await expect(bold.locator("svg")).toHaveCSS("stroke", "rgb(255, 255, 255)");
  await page.screenshot({ path: testInfo.outputPath("selection-toolbar.png") });
});

test("expanded menus do not show tooltips over actions and the lower bar adds no page scrollbar", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1520, height: 900 });
  await seed(page);
  const bar = page.getByRole("group", { name: "Форматирование сценария" });
  await bar.getByRole("button", { name: "Переход" }).hover();
  await expect(page.locator(".unified-tooltip")).toHaveText("CTRL + 6");
  const scroll = await page.evaluate(() => ({
    outerWidth: window.innerWidth - document.documentElement.clientWidth,
    bodyOverflow: getComputedStyle(document.body).overflowY,
  }));
  expect(scroll.outerWidth).toBe(0);
  expect(scroll.bodyOverflow).toBe("hidden");

  await page.getByRole("button", { name: "Документы", exact: true }).click();
  const more = page.locator(".document-row").first().locator(".document-more");
  await more.click();
  await expect(page.locator(".document-actions-popover")).toBeVisible();
  await page.mouse.move(0, 0);
  await more.hover();
  await page.waitForTimeout(300);
  await expect(page.locator(".unified-tooltip")).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("menu-without-overlapping-tooltip.png"),
  });
});

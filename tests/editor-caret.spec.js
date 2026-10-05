import { test, expect } from "@playwright/test";
import { grantPro } from "./helpers/pro-access.js";

const documentFixture = (id, title, text) => ({
  id,
  title,
  updatedAt: new Date().toISOString(),
  content: {
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: { format: "action", blockId: `${id}-text` },
        content: [{ type: "text", text }],
      },
    ],
  },
  components: [],
  props: [],
  comments: [],
  metadata: {},
  outline: { columns: [], cards: [] },
});
const editor = (page) =>
  page.getByRole("textbox", { name: "Screenplay editor" });
const line = (page, id = "one") =>
  page.locator(`p[data-block-id="${id}-text"]`);

async function seed(page, documents, pro = false) {
  if (pro) await grantPro(page);
  else
    await page.route("**/__tyter_local/**", (route) =>
      route.fulfill({ json: { documents: [] } }),
    );
  await page.addInitScript((documents) => {
    if (sessionStorage.getItem("caret-fixture")) return;
    localStorage.setItem("tyter.onboarding.v1", "done");
    localStorage.setItem("tyter.projects.v1", JSON.stringify(documents));
    localStorage.setItem("tyter.active", documents[0].id);
    sessionStorage.setItem("caret-fixture", "done");
  }, documents);
  await page.goto(pro ? "/pro" : "/free");
  await expect(editor(page)).toBeFocused();
}

async function placeCaret(page, target, offset) {
  await target.evaluate((node, offset) => {
    node.closest("[contenteditable]").focus();
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    let text;
    while ((text = walker.nextNode())) {
      if (offset <= text.length) break;
      offset -= text.length;
    }
    const range = document.createRange();
    range.setStart(text, offset);
    range.collapse(true);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  }, offset);
  await page.keyboard.press("Shift");
}

async function switchTo(page, title) {
  await page.getByRole("button", { name: "Документы", exact: true }).click();
  await page.locator(".document-item").filter({ hasText: title }).click();
  await expect(editor(page)).toBeFocused();
}

test("caret: a new document accepts typing immediately, including after leaving outline", async ({
  page,
}) => {
  await seed(page, [documentFixture("one", "Первый", "Начало и конец")], true);
  await page.getByRole("button", { name: "Аутлайн", exact: true }).click();
  await page.getByRole("button", { name: "Документы", exact: true }).click();
  await page
    .getByRole("button", { name: "Новый сценарий", exact: true })
    .click();
  await expect(editor(page)).toBeVisible();
  await expect(editor(page)).toBeFocused();
  await page.keyboard.insertText("ИНТ. КАФЕ — НОЧЬ");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("Кошка вошла.");
  await expect(editor(page).locator('p[data-format="scene"]')).toHaveText(
    "ИНТ. КАФЕ — НОЧЬ",
  );
  await expect(editor(page).locator('p[data-format="action"]')).toHaveText(
    "Кошка вошла.",
  );
});

test("caret: each document retains its insertion point when switched and reloaded", async ({
  page,
}) => {
  await seed(page, [
    documentFixture("one", "Первый", "Начало и конец"),
    documentFixture("two", "Второй", "Второй документ"),
  ]);
  await placeCaret(page, line(page), 6);
  await page.keyboard.insertText("!");
  await switchTo(page, "Второй");
  await placeCaret(page, line(page, "two"), 6);
  await page.keyboard.insertText("*");
  await switchTo(page, "Первый");
  await page.keyboard.insertText("?");
  await expect(line(page)).toHaveText("Начало!? и конец");
  await expect(page.getByRole("banner").getByRole("status")).toHaveText(
    "Сохранено на устройстве",
  );
  await page.reload();
  await expect(editor(page)).toBeFocused();
  await page.keyboard.insertText("#");
  await expect(line(page)).toHaveText("Начало!?# и конец");
  await switchTo(page, "Второй");
  await page.keyboard.insertText("+");
  await expect(line(page, "two")).toHaveText("Второй*+ документ");
});

test("caret: adding an outline scene preserves the original writing position", async ({
  page,
}) => {
  await seed(page, [documentFixture("one", "Первый", "Начало и конец")], true);
  await placeCaret(page, line(page), 6);
  await page.keyboard.insertText("!");
  await page.getByRole("button", { name: "Аутлайн", exact: true }).click();
  await page.getByRole("button", { name: "Три акта", exact: true }).click();
  await page
    .getByRole("button", { name: "Добавить карточку в Акт 1", exact: true })
    .click();
  await page.getByLabel("Название карточки").fill("Вторая сцена");
  await expect(page.getByLabel("Название карточки")).toBeFocused();
  await page.getByRole("button", { name: "Сценарий", exact: true }).click();
  await expect(editor(page)).toBeFocused();
  await page.keyboard.insertText("?");
  await expect(line(page)).toHaveText("Начало!? и конец");
  await expect(editor(page).locator('p[data-format="scene"]')).toHaveCount(1);
  // Intentional navigation still moves the cursor to the linked scene.
  await page.getByRole("button", { name: "Аутлайн", exact: true }).click();
  await page
    .getByRole("button", { name: "Перейти к сцене Вторая сцена", exact: true })
    .click();
  await expect(editor(page)).toBeFocused();
  await page.keyboard.insertText("X");
  await expect(editor(page).locator('p[data-format="scene"]')).toHaveText(
    /^XИНТ\./,
  );
});

test("caret: settings keep input focus and formatting returns to the last writing position", async ({
  page,
}) => {
  await seed(page, [documentFixture("one", "Первый", "Начало и конец")]);
  await placeCaret(page, line(page), 6);
  await page.keyboard.insertText("!");
  await page
    .getByRole("button", { name: "Настройки документа", exact: true })
    .click();
  const author = page.getByLabel("Автор", { exact: true });
  await author.fill("Анна");
  await expect(author).toBeFocused();
  await page.keyboard.insertText(" Петрова");
  await expect(author).toHaveValue("Анна Петрова");
  await page.getByRole("button", { name: "Действие", exact: true }).click();
  await expect(editor(page)).toBeFocused();
  await page.keyboard.insertText("?");
  await expect(line(page)).toHaveText("Начало!? и конец");
});

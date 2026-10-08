import { test, expect } from "@playwright/test";
import { createProject } from "../src/data.js";
import {
  codesRoute,
  listResponse,
  login,
  grantPro,
  storedProof,
} from "./helpers/pro-access.js";

const paragraph = (format, text, blockId) => ({
  type: "paragraph",
  attrs: { format, blockId },
  content: [{ type: "text", text }],
});
const fixture = () => {
  const project = createProject("Клавиши и орфография");
  project.content.content = [
    paragraph("scene", "ИНТ. ДОМ — ДЕНЬ", "scene"),
    paragraph(
      "action",
      "История начинается. Неверно написано: привкт.",
      "action",
    ),
    paragraph(
      "action",
      "The story begins. A spelling mistake: helo.",
      "english",
    ),
  ];
  return project;
};
async function open(page, { pro = false } = {}) {
  if (pro) await grantPro(page);
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ json: { documents: [] } }),
  );
  const project = fixture();
  await page.addInitScript((project) => {
    if (sessionStorage.getItem("account-shortcuts-seeded")) return;
    sessionStorage.setItem("account-shortcuts-seeded", "yes");
    localStorage.setItem("tyter.onboarding.v1", "done");
    localStorage.setItem("tyter.projects.v1", JSON.stringify([project]));
    localStorage.setItem("tyter.active", project.id);
    localStorage.setItem("tyter.language.v1", "ru");
  }, project);
  await page.goto(pro ? "/pro" : "/free");
  await expect(page.locator(".screenplay-editor")).toBeFocused();
  return project;
}
async function selectWord(page, blockId, word) {
  const paragraph = page.locator(`[data-block-id="${blockId}"]`);
  await paragraph.evaluate((element, word) => {
    element.closest('[contenteditable="true"]').focus();
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const offset = node.textContent.indexOf(word);
      if (offset < 0) continue;
      const range = document.createRange();
      range.setStart(node, offset);
      range.setEnd(node, offset + word.length);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
      return;
    }
    throw new Error("Word not found");
  }, word);
  await expect(page.locator(".selection-toolbar")).toBeVisible();
}

test("Ctrl+Q comments the selected text, including a Russian keyboard; only the selection tooltip advertises it", async ({
  page,
}) => {
  await open(page);
  const rail = page.locator(".workspace-tools .comments-toggle");
  await rail.hover();
  await expect(page.locator(".unified-tooltip")).toHaveText("Комментарии");
  await selectWord(page, "action", "История");
  const button = page.getByRole("button", { name: "Комментировать выделение" });
  await button.hover();
  await expect(page.locator("#selection-tip-comment")).toHaveText(
    "Комментировать · CTRL + Q",
  );
  await page.keyboard.press("Control+q");
  await expect(page.locator(".composer-quote")).toHaveText("История");
  const composer = page.getByRole("textbox", { name: "Текст комментария" });
  await expect(composer).toBeFocused();
  await composer.fill("Заметка");
  await page.keyboard.press("Control+Enter");
  await expect(page.locator(".comment-card")).toContainText("Заметка");
  await page.keyboard.press("Escape");
  await selectWord(page, "action", "начинается");
  await page.locator(".screenplay-editor").dispatchEvent("keydown", {
    key: "й",
    code: "KeyQ",
    ctrlKey: true,
    bubbles: true,
  });
  await expect(page.locator(".composer-quote")).toHaveText("начинается");
  await composer.fill("Ввод в комментарии");
  await composer.press("Control+q");
  await expect(composer).toHaveValue("Ввод в комментарии");
});

test("spelling highlights default to off, persist through reload/TYT, and follow the interface language", async ({
  page,
}, testInfo) => {
  await open(page);
  const editor = page.locator(".screenplay-editor");
  await expect(editor).toHaveAttribute("spellcheck", "false");
  await expect(editor).toHaveAttribute("lang", "ru");
  await page
    .getByRole("button", { name: "Настройки документа", exact: true })
    .click();
  const checkbox = page.getByRole("checkbox", { name: "Подсветка орфографии" });
  await expect(checkbox).not.toBeChecked();
  await checkbox.check();
  await expect(editor).toHaveAttribute("spellcheck", "true");
  await page.getByRole("button", { name: "ENG", exact: true }).click();
  await expect(editor).toHaveAttribute("lang", "en");
  await expect(
    page.getByText("Spelling language — English", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("tyter.projects.v1"))[0].settings
            .spellcheck,
      ),
    )
    .toBe(true);
  await page.reload();
  await expect(editor).toHaveAttribute("spellcheck", "true");
  await expect(editor).toHaveAttribute("lang", "en");
  await page
    .getByRole("button", { name: "Document settings", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: "Highlight spelling errors" })
    .uncheck();
  await expect(editor).toHaveAttribute("spellcheck", "false");
  await page.screenshot({ path: testInfo.outputPath("spelling-settings.png") });
  const tytSetting = await page.evaluate(async () => {
    const { exportTYT, readTYT } = await import("/src/tyt-format.js");
    const project = JSON.parse(localStorage.getItem("tyter.projects.v1"))[0];
    project.settings.spellcheck = true;
    const file = await exportTYT(project, []);
    return readTYT(await file.text()).settings.spellcheck;
  });
  expect(tytSetting).toBe(true);
});

test("Russian and English local spelling suggestions work with highlighting off", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await open(page);
  await selectWord(page, "action", "привкт");
  await page.locator('[data-block-id="action"]').click({ button: "right" });
  const menu = page.getByRole("menu", { name: "Действия с текстом" });
  await expect(
    menu.getByText("Орфография · русский", { exact: true }),
  ).toBeVisible();
  await expect(
    menu.getByRole("menuitem", { name: "привет", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "ENG", exact: true }).click();
  await selectWord(page, "english", "helo");
  await page.locator('[data-block-id="english"]').click({ button: "right" });
  const english = page.getByRole("menu", { name: "Text actions" });
  await expect(
    english.getByText("Spelling · English", { exact: true }),
  ).toBeVisible();
  await english.getByRole("menuitem", { name: "hello", exact: true }).click();
  await expect(page.locator('[data-block-id="english"]')).toContainText(
    "hello.",
  );
  await expect(page.locator(".screenplay-editor")).toHaveAttribute(
    "spellcheck",
    "false",
  );
  expect(errors).toEqual([]);
});

for (const pro of [false, true])
  test(`${pro ? "PRO" : "FREE"}: Ctrl+O opens the screenplay chooser and imports a supported document`, async ({
    page,
  }) => {
    const project = await open(page, { pro });
    const choosing = page.waitForEvent("filechooser");
    await page.keyboard.press("Control+o");
    const chooser = await choosing;
    const accept = await chooser.element().getAttribute("accept");
    for (const format of [".fdx", ".docx", ".pdf"])
      expect(accept).toContain(format);
    expect(accept.includes(".tyt")).toBe(pro);
    const file = pro
      ? {
          name: "Открытый сценарий.tyt",
          mimeType: "application/vnd.tyter+json",
          buffer: Buffer.from(
            JSON.stringify({
              format: "tyter",
              version: 1,
              document: { ...project, title: "Открытый сценарий" },
              history: [],
            }),
          ),
        }
      : {
          name: "Открытый сценарий.fdx",
          mimeType: "application/xml",
          buffer: Buffer.from(
            '<FinalDraft DocumentType="Script" Version="1"><Content><Paragraph Type="Scene Heading"><Text>ИНТ. НОВЫЙ ДОМ — ДЕНЬ</Text></Paragraph><Paragraph Type="Action"><Text>Открытый сценарий.</Text></Paragraph></Content></FinalDraft>',
          ),
        };
    await chooser.setFiles(file);
    await expect(page.locator(".screenplay-editor")).toContainText(
      pro ? "История начинается" : "Открытый сценарий.",
    );
    await expect(
      page.getByRole("button", { name: "Документы", exact: true }),
    ).toContainText("Открытый сценарий");
  });

test("a stale tab cannot restore a deleted document; Ctrl+O can explicitly reopen its TYT backup", async ({
  page,
}) => {
  const project = await open(page, { pro: true });
  const deleted = await page.evaluate(async (project) => {
    const { browserRequest } = await import("/src/browser-files.js");
    await browserRequest("documents", { documents: [project] });
    await browserRequest("delete-document", { id: project.id });
    await browserRequest("documents", { documents: [project] });
    return (await browserRequest("documents")).documents.some(
      (doc) => doc.id === project.id,
    );
  }, project);
  expect(deleted).toBe(false);
  await page.reload();
  await expect(page.locator(".screenplay-editor")).toBeVisible();
  const choosing = page.waitForEvent("filechooser");
  await page.keyboard.press("Control+o");
  await (
    await choosing
  ).setFiles({
    name: "Восстановленный.tyt",
    mimeType: "application/vnd.tyter+json",
    buffer: Buffer.from(
      JSON.stringify({
        format: "tyter",
        version: 1,
        document: { ...project, title: "Восстановленный" },
        history: [],
      }),
    ),
  });
  await expect(page.locator(".screenplay-editor")).toContainText(
    "История начинается",
  );
  await expect
    .poll(() =>
      page.evaluate(async (id) => {
        const { browserRequest } = await import("/src/browser-files.js");
        const documents = (await browserRequest("documents")).documents;
        return documents.some(
          (doc) => doc.title === "Восстановленный" && doc.id !== id,
        );
      }, project.id),
    )
    .toBe(true);
  await page.reload();
  await expect(page.locator(".screenplay-editor")).toContainText(
    "История начинается",
  );
});

test("sign out is below Help, clears the session across tabs, and retains the last local edit", async ({
  page,
  context,
}) => {
  await context.route(codesRoute, async (route) =>
    route.fulfill(await listResponse()),
  );
  await page.addInitScript(() =>
    localStorage.setItem("tyter.onboarding.v1", "done"),
  );
  await page.goto("/pro");
  await page.getByLabel("Email", { exact: true }).fill(login.email);
  await page.getByLabel("Ключ доступа").fill(login.code);
  await page.getByRole("button", { name: "Открыть Pro", exact: true }).click();
  await expect(page.locator(".screenplay-editor")).toBeFocused();
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const { browserRequest } = await import("/src/browser-files.js");
        return (await browserRequest("documents")).documents.length;
      }),
    )
    .toBeGreaterThan(0);
  const other = await context.newPage();
  await other.goto("/pro");
  await expect(other.locator(".screenplay-editor")).toBeVisible();
  await page.bringToFront();
  await page.locator(".screenplay-editor").press("Control+End");
  await page.keyboard.insertText("Последние изменения перед выходом");
  const logout = page.getByRole("button", {
    name: "Выйти из аккаунта",
    exact: true,
  });
  const help = await page
    .getByRole("button", { name: "Обучение", exact: true })
    .boundingBox();
  const bounds = await logout.boundingBox();
  expect(bounds.y).toBeGreaterThan(help.y + help.height);
  await logout.click();
  await expect(
    page.getByRole("heading", { name: "Вход в Pro", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Ключ доступа")).toHaveValue("");
  await expect(
    other.getByRole("heading", { name: "Вход в Pro", exact: true }),
  ).toBeVisible();
  expect(await storedProof(page)).toBeNull();
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const { browserRequest } = await import("/src/browser-files.js");
        const { documents } = await browserRequest("documents");
        return documents.some((doc) =>
          JSON.stringify(doc.content).includes(
            "Последние изменения перед выходом",
          ),
        );
      }),
    )
    .toBe(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Вход в Pro", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill(login.email);
  await page.getByLabel("Ключ доступа").fill(login.code);
  await page.getByRole("button", { name: "Открыть Pro", exact: true }).click();
  await expect(page.locator(".screenplay-editor")).toContainText(
    "Последние изменения перед выходом",
  );
  expect(await storedProof(page)).not.toBeNull();
});

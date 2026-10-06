import { test, expect } from "@playwright/test";
import { createProject } from "../src/data.js";
import { grantPro } from "./helpers/pro-access.js";

function fixture(empty = false) {
  const project = createProject("История");
  project.id = "navigation-help";
  project.metadata.formatBarMode = "icons";
  project.content.content = [
    {
      type: "paragraph",
      attrs: { format: "scene", blockId: "scene" },
      ...(!empty
        ? { content: [{ type: "text", text: "ИНТ. ДОМ — ДЕНЬ" }] }
        : {}),
    },
    ...(!empty
      ? [
          {
            type: "paragraph",
            attrs: { format: "action", blockId: "last" },
            content: [{ type: "text", text: "Последняя строка." }],
          },
        ]
      : []),
  ];
  project.outline = {
    columns: [{ id: "act", title: "Акт 1" }],
    cards: [
      {
        id: "card",
        columnId: "act",
        title: "Начало",
        text: "История начинается",
        drama: 3,
        blockId: "scene",
        comments: [],
      },
    ],
  };
  return project;
}
async function open(page, project = fixture(), pro = true) {
  if (pro) await grantPro(page);
  else
    await page.route("**/__tyter_local/**", (route) =>
      route.fulfill({ json: { documents: [] } }),
    );
  await page.addInitScript((project) => {
    localStorage.setItem("tyter.onboarding.v1", "done");
    localStorage.setItem("tyter.projects.v1", JSON.stringify([project]));
    localStorage.setItem("tyter.active", project.id);
  }, project);
  await page.goto(pro ? "/pro" : "/free");
  await expect(page.locator(".screenplay-editor")).toBeFocused();
}
const tools = (page) =>
  page.getByRole("navigation", { name: "Инструменты редактора" });

test("all tools and comments are on the left, the mode switch stays right and export fits the viewport", async ({
  page,
}, info) => {
  await open(page);
  const rail = tools(page);
  for (const name of [
    "Поиск по сценарию",
    "Статистика документа",
    "Компоненты",
    "Реквизит",
    "Комментарии",
    "История изменений",
    "Скачать сценарий",
    "Настройки документа",
    "Обучение",
  ])
    await expect(rail.getByRole("button", { name, exact: true })).toBeVisible();
  await expect(page.locator(".minimal-header .icon-button")).toHaveCount(0);
  await expect(page.locator(".screenplay-format-bar button")).toHaveCount(7);
  await expect(
    page
      .locator(".screenplay-format-bar")
      .getByRole("button", { name: "Комментарии" }),
  ).toHaveCount(0);
  const header = await page.locator(".minimal-header").boundingBox();
  const toggle = await page
    .getByRole("group", { name: "Режим документа" })
    .boundingBox();
  expect(header.x + header.width - toggle.x - toggle.width).toBeLessThanOrEqual(
    24,
  );
  for (const [button, name] of [
    ["Комментарии", "Комментарии сценария"],
    ["История изменений", "История изменений"],
    ["Настройки документа", "Настройки документа"],
  ]) {
    await rail.getByRole("button", { name: button, exact: true }).click();
    const drawer = page.getByRole("complementary", { name, exact: true });
    await expect(drawer).toBeVisible();
    const box = await drawer.boundingBox();
    expect(box.x).toBe(64);
    expect(box.x + box.width).toBe(
      (await page.locator(".editor-column").boundingBox()).x,
    );
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
  }
  await page.screenshot({ path: info.outputPath("left-rail.png") });
  await page.setViewportSize({ width: 390, height: 720 });
  await rail.getByRole("button", { name: "Скачать сценарий" }).click();
  const menu = page.locator(".rail-export-menu");
  await expect(menu).toBeVisible();
  const bounds = await menu.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(64);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(720);
  await page.screenshot({ path: info.outputPath("mobile-export.png") });
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await rail.getByRole("button", { name: "Комментарии", exact: true }).click();
  const mobileDrawer = await page.locator(".comments-drawer").boundingBox();
  expect(mobileDrawer.x).toBe(64);
  expect(mobileDrawer.x + mobileDrawer.width).toBeLessThanOrEqual(390);
  expect((await page.locator(".minimal-header").boundingBox()).height).toBe(64);
});

test("Alt+1 and Alt+2 switch views from the editor and outline inputs, while Free remains gated", async ({
  page,
}) => {
  await open(page);
  await page.keyboard.press("Alt+2");
  await expect(
    page.getByRole("button", { name: "Аутлайн", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(tools(page)).toBeVisible();
  await expect(
    tools(page).getByRole("button", { name: "Компоненты", exact: true }),
  ).toHaveCount(0);
  await page.locator('.outline-card[data-card-id="card"]').click();
  await page
    .getByLabel("Текст карточки", { exact: true })
    .fill("Новый текст карточки");
  await page.keyboard.press("Alt+1");
  await expect(page.locator(".screenplay-editor")).toBeFocused();
  await expect(page.locator(".outline-card-drawer")).toHaveCount(0);
  await page.keyboard.press("Alt+2");
  await expect(page.locator(".outline-card")).toContainText(
    "Новый текст карточки",
  );
  await page.keyboard.press("Alt+1");
  await expect(page.locator(".screenplay-editor")).toContainText(
    "Последняя строка.",
  );
  await open(page, fixture(), false);
  await page.keyboard.press("Alt+2");
  await expect(
    page.getByRole("dialog", { name: "Полная версия Tyter" }),
  ).toBeVisible();
  await expect(page.locator(".outline-layout")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".screenplay-editor")).toBeFocused();
});

test("blank paper clicks place the caret at the last line and the initial hint is visible without entering document content", async ({
  page,
}, info) => {
  await open(page, fixture(true));
  const editor = page.locator(".screenplay-editor");
  const hint = editor.locator("[data-placeholder]");
  await expect(hint).toHaveAttribute(
    "data-placeholder",
    "Начни писать свою историю...",
  );
  const style = await hint.evaluate((el) => {
    const css = getComputedStyle(el, "::after");
    return {
      content: css.content,
      color: css.color,
      transform: css.textTransform,
    };
  });
  expect(style.content).toContain("Начни писать свою историю...");
  expect(style.color).toBe("rgb(155, 150, 161)");
  expect(style.transform).toBe("none");
  expect(await editor.textContent()).not.toContain("Начни писать");
  await page.screenshot({ path: info.outputPath("empty-hint.png") });
  await page.keyboard.insertText("ИНТ. ДОМ — ДЕНЬ");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("Последняя строка.");
  await expect(hint).toHaveCount(0);
  await page.keyboard.press("Control+Home");
  let last = await editor.locator("p").last().boundingBox();
  await page.mouse.click(last.x + 30, last.y + last.height + 40);
  await expect(editor).toBeFocused();
  await page.keyboard.insertText(" Ещё текст.");
  await expect(editor.locator("p").last()).toHaveText(
    "Последняя строка. Ещё текст.",
  );
  await page.keyboard.press("Control+Home");
  last = await editor.locator("p").last().boundingBox();
  await page.mouse.click(last.x + 150, last.y + last.height + 60);
  await page.keyboard.insertText(" Конец.");
  await expect(editor.locator("p").last()).toHaveText(
    "Последняя строка. Ещё текст. Конец.",
  );
  await expect(editor.locator("p")).toHaveCount(2);
});

test("help has keyboard accessible tabs, all custom shortcuts and a scrollable list on mobile", async ({
  page,
}, info) => {
  await open(page);
  await tools(page)
    .getByRole("button", { name: "Обучение", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Знакомство с редактором" });
  await expect(dialog.getByRole("tab", { name: "Онбординг" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await dialog.getByRole("button", { name: "Далее", exact: true }).click();
  await dialog.getByRole("tab", { name: "Горячие клавиши" }).click();
  for (const key of [
    "Alt + 1",
    "Alt + 2",
    "Ctrl + D",
    "Ctrl + E",
    "Ctrl + 8",
    "Ctrl + Alt + → / ←",
    "Ctrl + Shift + B",
    "Ctrl + Shift + S",
    "Ctrl + S",
    "Ctrl + колесо мыши",
    "Esc",
  ])
    await expect(
      dialog.locator("kbd").filter({ hasText: key }).first(),
    ).toHaveCount(1);
  await dialog.getByRole("tab", { name: "Горячие клавиши" }).press("ArrowLeft");
  await expect(dialog).toContainText("Сценарный формат — с клавиатуры");
  await dialog.getByRole("tab", { name: "Онбординг" }).press("ArrowRight");
  await page.setViewportSize({ width: 390, height: 650 });
  const bounds = await dialog.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(650);
  await dialog
    .locator(".help-body")
    .evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
  await expect(
    dialog.locator("kbd").filter({ hasText: "Ctrl + V" }),
  ).toBeInViewport();
  await expect(dialog.getByRole("tab", { name: "Онбординг" })).toBeInViewport();
  await page.screenshot({ path: info.outputPath("mobile-shortcuts.png") });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".screenplay-editor")).toBeFocused();
});

test("Escape closes popovers, annotation forms and outline panels without deleting data", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "Документы", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".document-menu")).toHaveCount(0);
  await page.locator(".screenplay-editor").press("Control+a");
  await page.keyboard.press("Control+d");
  await expect(page.locator(".component-editor")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".components-drawer")).toHaveCount(0);
  await page.keyboard.press("Alt+2");
  await page.locator('.outline-card[data-card-id="card"]').click();
  await page
    .getByRole("button", { name: "График драматичности", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".outline-card-drawer")).toHaveCount(0);
  await expect(page.locator(".outline-drama-panel")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "График драматичности", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Действия с актом Акт 1" }).click();
  await page
    .getByRole("button", { name: "Переименовать акт", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Название акта")).toHaveCount(0);
  await page.getByRole("button", { name: "Действия с актом Акт 1" }).click();
  await page
    .locator(".outline-menu")
    .getByRole("button", { name: "Удалить", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Удалить из аутлайна" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".outline-column")).toHaveCount(1);
  await expect(page.locator(".outline-card")).toHaveCount(1);
});

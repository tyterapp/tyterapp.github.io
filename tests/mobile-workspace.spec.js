import { test, expect } from "@playwright/test";
import { createProject, validateImport } from "../src/data.js";
import { mobileViewport } from "../src/mobile-workspace.js";
import { grantPro } from "./helpers/pro-access.js";

test.use({ isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const p = (format, text, blockId) => ({
  type: "paragraph",
  attrs: { format, blockId },
  content: [{ type: "text", text }],
});
function fixture() {
  const doc = createProject("Мобильная история с длинным названием");
  doc.id = "mobile-document";
  doc.content.content = [
    p("scene", "ИНТ. КАФЕ — ДЕНЬ", "scene"),
    p("action", "Анна смотрит на улицу. ".repeat(10), "action"),
    p("character", "АННА", "anna"),
    p(
      "speech",
      "Мы ещё встретимся. Это только начало нашей истории.",
      "speech",
    ),
  ];
  doc.components = [
    {
      id: "hero",
      name: "АННА",
      description: "Главная героиня",
      type: "character",
    },
  ];
  doc.sceneVariants = {
    scene: {
      F: [
        p("scene", "ИНТ. КАФЕ — НОЧЬ", "scene"),
        p("action", "Альтернативная сцена F.", "action-f"),
      ],
    },
  };
  doc.outline = {
    columns: [{ id: "act", title: "Акт 1" }],
    cards: [
      {
        id: "card",
        columnId: "act",
        blockId: "scene",
        title: "Встреча",
        text: "В кафе",
        comments: [],
      },
    ],
  };
  doc.comments = [
    {
      id: "comment",
      text: "Ночной вариант",
      quote: "Альтернативная сцена F.",
      sceneId: "scene",
      sceneVariant: "F",
      createdAt: new Date().toISOString(),
    },
  ];
  return validateImport(doc);
}
async function open(page, { width = 390, theme = "light", pro = false } = {}) {
  await page.setViewportSize({ width, height: 844 });
  if (pro) await grantPro(page);
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  await page.addInitScript(
    ({ doc, theme }) => {
      localStorage.setItem("tyter.onboarding.v1", "done");
      if (sessionStorage.getItem("mobile-seeded")) return;
      localStorage.setItem("tyter.projects.v1", JSON.stringify([doc]));
      localStorage.setItem("tyter.active", doc.id);
      localStorage.setItem("tyter.language.v1", "ru");
      localStorage.setItem(
        "tyter.editor-preferences.v1",
        JSON.stringify({ theme }),
      );
      sessionStorage.setItem("mobile-seeded", "yes");
    },
    { doc: fixture(), theme },
  );
  await page.goto(pro ? "/beta" : "/free");
  await page.bringToFront();
  await expect(page.locator(".screenplay-editor")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}
const stored = (page) =>
  page.evaluate(async () =>
    (
      await (await import("/src/browser-files.js")).browserRequest("documents")
    ).documents.find((doc) => doc.id === "mobile-document"),
  );
const tools = async (page) => {
  await page
    .getByRole("button", { name: "Открыть инструменты", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Инструменты редактора", exact: true }),
  ).toBeVisible();
};
const sheet = (page) =>
  page.getByRole("dialog", { name: "Панель сценария", exact: true });

test("keyboard viewport geometry is independent of pinch zoom and editor mode", () => {
  expect(
    mobileViewport({ height: 400, offsetTop: 80, scale: 1 }, 844, true),
  ).toEqual({ height: 400, top: 80, keyboard: true });
  expect(
    mobileViewport({ height: 400, offsetTop: 80, scale: 2 }, 844, true),
  ).toEqual({ height: 844, top: 0, keyboard: false });
  expect(mobileViewport(null, 844, true)).toEqual({
    height: 844,
    top: 0,
    keyboard: false,
  });
});

for (const [width, theme] of [
  [320, "light"],
  [390, "dark"],
  [831, "light"],
]) {
  test(`${width}px ${theme}: the paper and all seven bottom controls fit without opening the keyboard`, async ({
    page,
  }, info) => {
    await open(page, { width, theme });
    await expect(page.locator(".minimal-app")).toHaveAttribute(
      "data-mobile",
      "true",
    );
    await expect(page.locator(".screenplay-editor")).not.toBeFocused();
    expect(
      await page
        .locator(".script-paper")
        .evaluate((node) =>
          Math.abs(node.getBoundingClientRect().width - innerWidth),
        ),
    ).toBeLessThan(1);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
    const buttons = await page
      .locator(".format-bar-button")
      .evaluateAll((nodes) =>
        nodes.map((node) => {
          const box = node.getBoundingClientRect();
          return { left: box.left, right: box.right, height: box.height };
        }),
      );
    expect(buttons).toHaveLength(7);
    for (const button of buttons) {
      expect(button.left).toBeGreaterThanOrEqual(0);
      expect(button.right).toBeLessThanOrEqual(width);
      expect(button.height).toBeGreaterThanOrEqual(44);
    }
    await page.screenshot({
      path: info.outputPath(`mobile-${width}-${theme}.png`),
    });
  });
}

test("mobile layout stops at 832px and resizing preserves content and desktop geometry", async ({
  page,
}) => {
  await open(page);
  await page.locator('[data-block-id="action"]').click();
  await page.keyboard.insertText("Телефон ");
  await page.setViewportSize({ width: 832, height: 844 });
  await expect(page.locator(".minimal-app")).not.toHaveAttribute(
    "data-mobile",
    "true",
  );
  await expect(
    page.getByRole("button", { name: "Открыть инструменты" }),
  ).toHaveCount(0);
  await expect(page.locator(".workspace-tools")).toBeVisible();
  expect(
    (await page.locator(".script-paper").boundingBox()).width,
  ).toBeGreaterThanOrEqual(580);
  await expect(page.locator('[data-block-id="action"]')).toContainText(
    "Телефон",
  );
  await page.setViewportSize({ width: 319, height: 844 });
  await expect(page.locator(".minimal-app")).not.toHaveAttribute(
    "data-mobile",
    "true",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".minimal-app")).toHaveAttribute(
    "data-mobile",
    "true",
  );
  await expect(page.locator('[data-block-id="action"]')).toContainText(
    "Телефон",
  );
});

test("components open as an accessible sheet, edit the same document and close with a swipe", async ({
  page,
}, info) => {
  await open(page, { theme: "dark" });
  await page.getByRole("button", { name: "Компоненты", exact: true }).click();
  await expect(sheet(page)).toBeVisible();
  expect(
    await page.locator(".minimal-app").evaluate((node) => node.inert),
  ).toBe(true);
  await sheet(page)
    .getByRole("textbox", { name: "Поиск компонентов" })
    .fill("АННА");
  await sheet(page)
    .getByRole("button", { name: /^АННА / })
    .click();
  await sheet(page)
    .getByRole("textbox", { name: /Описание/ })
    .fill("Описание с телефона");
  await sheet(page)
    .getByRole("button", { name: "Сохранить", exact: true })
    .click();
  await expect
    .poll(async () => (await stored(page))?.components[0].description)
    .toBe("Описание с телефона");
  await page.screenshot({ path: info.outputPath("mobile-components.png") });
  const handle = page.locator(".mobile-sheet-handle");
  await handle.dispatchEvent("pointerdown", {
    clientY: 150,
    pointerId: 1,
    pointerType: "touch",
  });
  await handle.dispatchEvent("pointerup", {
    clientY: 230,
    pointerId: 1,
    pointerType: "touch",
  });
  await expect(sheet(page)).toHaveCount(0);
  expect(
    await page.locator(".minimal-app").evaluate((node) => node.inert),
  ).toBe(false);
  await page.reload();
  await expect
    .poll(async () => (await stored(page))?.components[0].description)
    .toBe("Описание с телефона");
});

test("keyboard resize keeps formatting above the keyboard and touch formatting keeps the caret", async ({
  page,
}, info) => {
  await open(page);
  await page.locator('[data-block-id="action"]').click();
  await page.evaluate(() => {
    window.mobileTestViewport = new EventTarget();
    Object.assign(window.mobileTestViewport, {
      height: 400,
      offsetTop: 80,
      scale: 1,
    });
    // Install before remounting the viewport observer below.
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: window.mobileTestViewport,
    });
  });
  await page.setViewportSize({ width: 832, height: 844 });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-block-id="action"]').click();
  await page.evaluate(() =>
    window.mobileTestViewport.dispatchEvent(new Event("resize")),
  );
  await expect(page.locator(".minimal-app")).toHaveAttribute(
    "data-keyboard",
    "true",
  );
  const bar = await page.locator(".minimal-footer").boundingBox();
  expect(bar.y + bar.height).toBeLessThanOrEqual(481);
  expect(bar.y).toBeGreaterThan(400);
  await page.getByRole("button", { name: "Реплика", exact: true }).tap();
  await expect(page.locator(".screenplay-editor")).toBeFocused();
  await expect(page.locator('[data-block-id="action"]')).toHaveAttribute(
    "data-format",
    "speech",
  );
  await page.screenshot({ path: info.outputPath("mobile-keyboard.png") });
  await page.evaluate(() => {
    window.mobileTestViewport.height = 844;
    window.mobileTestViewport.offsetTop = 0;
    window.mobileTestViewport.dispatchEvent(new Event("resize"));
  });
  await expect(page.locator(".minimal-app")).not.toHaveAttribute(
    "data-keyboard",
    "true",
  );
  expect((await page.locator(".minimal-app").boundingBox()).height).toBe(844);
});

test("tools retain search, outline, libraries, settings, timer and full project export in a local session", async ({
  page,
  context,
}, info) => {
  test.setTimeout(60000);
  await open(page, { pro: true });
  await tools(page);
  for (const name of [
    "Поиск по сценарию",
    "Статистика документа",
    "Доктор сценария",
    "Задания",
    "Реплики персонажей",
    "Реквизит",
    "Комментарии",
    "История изменений",
    "Скачать сценарий",
    "Настройки документа",
    "Выйти из аккаунта",
  ])
    await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Настройки документа", exact: true })
    .click();
  await expect(sheet(page)).toBeVisible();
  await expect(
    sheet(page).getByRole("slider", { name: "Масштаб документа", exact: true }),
  ).toBeVisible();
  await sheet(page)
    .getByRole("slider", { name: "Масштаб документа", exact: true })
    .fill("200");
  await sheet(page).getByRole("button", { name: "Закрыть настройки" }).click();
  await expect(sheet(page)).toHaveCount(0);
  expect((await page.locator(".script-paper").boundingBox()).width).toBe(390);
  await page.getByRole("button", { name: "Аутлайн", exact: true }).click();
  await expect(page.locator(".outline-card")).toContainText("Встреча");
  await page.getByRole("button", { name: "Сценарий", exact: true }).click();
  await page.getByRole("button", { name: "Компоненты", exact: true }).click();
  await sheet(page)
    .getByRole("button", { name: /^АННА / })
    .click();
  const description = sheet(page).getByRole("textbox", { name: /Описание/ });
  await description.fill("Черновик с телефона");
  await sheet(page)
    .getByRole("button", { name: "Библиотеки компонентов", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Библиотеки компонентов" }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("mobile-library.png") });
  await page.getByRole("button", { name: "Закрыть библиотеки" }).click();
  await expect(description).toHaveValue("Черновик с телефона");
  await description.fill("Главная героиня");
  await sheet(page)
    .getByRole("button", { name: "Сохранить", exact: true })
    .click();
  await sheet(page).getByRole("button", { name: "Закрыть компоненты" }).click();
  const original = await page.evaluate(async () =>
    (await import("/src/workspace-session.js")).workspaceSession(),
  );
  const second = await context.newPage();
  await grantPro(second);
  await second.goto("/beta");
  await expect(second.locator(".screenplay-editor")).toBeVisible();
  const other = await second.evaluate(async () =>
    (await import("/src/workspace-session.js")).workspaceSession(),
  );
  expect(other.id).toBe(original.id);
  expect(other.clientId).not.toBe(original.clientId);
  await second.close();
  await page.bringToFront();
  await tools(page);
  await page
    .getByRole("button", { name: "Скачать сценарий", exact: true })
    .click();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: /Проект Tyter · TYT/ }).click();
  const download = await downloaded;
  const stream = await download.createReadStream();
  let text = "";
  for await (const chunk of stream) text += chunk;
  const exported = JSON.parse(text).document;
  expect(exported.components[0].description).toBe("Главная героиня");
  expect(exported.sceneVariants.scene.F[1].content[0].text).toBe(
    "Альтернативная сцена F.",
  );
  expect(exported.outline.cards[0].title).toBe("Встреча");
  expect(exported.comments[0].text).toBe("Ночной вариант");
  await page.reload();
  await expect(page.locator(".screenplay-editor")).toBeVisible();
  expect(
    (
      await page.evaluate(async () =>
        (await import("/src/workspace-session.js")).workspaceSession(),
      )
    ).id,
  ).toBe(original.id);
});

test("free mobile editing persists across a desktop-width reload without unlocking Pro", async ({
  page,
}) => {
  await open(page);
  await page.locator('[data-block-id="action"]').click();
  await page.keyboard.insertText("Общий склад ");
  await expect
    .poll(async () => JSON.stringify((await stored(page))?.content))
    .toContain("Общий склад");
  await page.setViewportSize({ width: 1200, height: 844 });
  await page.reload();
  await expect(page.locator('[data-block-id="action"]')).toContainText(
    "Общий склад",
  );
  await page.getByRole("button", { name: "Аутлайн", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Полная версия Tyter" }),
  ).toBeVisible();
});

test("mobile search and comments open hidden scene variants and character reading keeps navigation", async ({
  page,
}) => {
  await open(page, { pro: true, width: 320 });
  await tools(page);
  await page
    .getByRole("button", { name: "Поиск по сценарию", exact: true })
    .click();
  await sheet(page)
    .getByRole("textbox", { name: "Поиск по тексту", exact: true })
    .fill("Альтернативная");
  await expect(sheet(page).locator(".search-result-card")).toContainText(
    "Вариант F",
  );
  await sheet(page).locator(".search-result-card").click();
  await sheet(page).getByRole("button", { name: "Закрыть поиск" }).click();
  await expect(page.locator('[data-block-id="action-f"]')).toBeVisible();
  const variant = page.getByRole("combobox", {
    name: "Вариант сцены 1",
    exact: true,
  });
  await variant.click();
  await page.getByRole("option", { name: "A", exact: true }).click();
  await tools(page);
  await page.getByRole("button", { name: "Комментарии", exact: true }).click();
  await expect(sheet(page).locator(".comment-card")).toContainText("вариант F");
  await sheet(page).locator(".comment-card").click();
  await sheet(page)
    .getByRole("button", { name: "Закрыть комментарии" })
    .click();
  await expect(variant).toHaveText("A");
  await tools(page);
  await page
    .getByRole("button", { name: "Реплики персонажей", exact: true })
    .click();
  await expect(page.locator(".character-dialogue-view")).toContainText(
    "Мы ещё встретимся",
  );
  await page
    .getByRole("button", { name: "Вернуться к сценарию", exact: true })
    .click();
  await expect(page.locator(".screenplay-editor")).toBeVisible();
  await page
    .getByRole("button", { name: "Открыть во весь экран", exact: true })
    .click();
  await expect(page.locator(".minimal-header")).toBeHidden();
  await expect(page.locator(".format-bar-button")).toHaveCount(7);
  await expect(page.locator(".minimal-footer")).toBeVisible();
  await page
    .getByRole("button", {
      name: "Выйти из полноэкранного режима",
      exact: true,
    })
    .click();
  await expect(page.locator(".minimal-header")).toBeVisible();
});

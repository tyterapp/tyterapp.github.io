import { test, expect } from "@playwright/test";
import { createProject, validateImport } from "../src/data.js";
import { grantPro } from "./helpers/pro-access.js";
import { selectAppOption } from "./helpers/app-select.js";

const p = (format, text, blockId, commentId) => ({
  type: "paragraph",
  attrs: { format, blockId },
  content: [
    {
      type: "text",
      text,
      ...(commentId
        ? { marks: [{ type: "comment", attrs: { id: commentId } }] }
        : {}),
    },
  ],
});
function fixture(long = false, zoom = 100) {
  const doc = createProject("Оформление редактора");
  doc.id = "ui-polish";
  doc.metadata.documentZoom = zoom;
  const quote =
    "Анна стоит у окна. Длинная заметка к действию переносится на следующую строку и остаётся читаемой.";
  doc.content.content = [
    p("scene", "ИНТ. ДОМ — ДЕНЬ", "scene"),
    p("action", quote, "action", "comment-1"),
    p("character", "АННА", "anna"),
    p("speech", "Доброе утро.", "anna-speech"),
    p("character", "БОРИС", "boris"),
    p("speech", "До вечера.", "boris-speech"),
    p("action", "Строка для второго комментария.", "second", "comment-2"),
    ...(long
      ? Array.from({ length: 55 }, (_, i) =>
          p(
            "action",
            `Строка ${i + 1}. Героиня идёт по улице, а вокруг просыпается город. `.repeat(
              2,
            ),
            `long-${i}`,
          ),
        )
      : []),
  ];
  doc.components = [
    {
      id: "anna-component",
      name: "Анна",
      type: "character",
      description: "Героиня",
    },
  ];
  doc.comments = [
    {
      id: "comment-1",
      text: "Первое замечание",
      quote,
      blockId: "action",
      author: "Вы",
      createdAt: "2026-10-08T10:00:00.000Z",
      resolved: false,
    },
    {
      id: "comment-2",
      text: "Второе замечание",
      quote: "Строка для второго комментария.",
      blockId: "second",
      author: "Вы",
      createdAt: "2026-10-08T10:00:00.000Z",
      resolved: false,
    },
  ];
  doc.outline = {
    columns: [{ id: "act", title: "Акт 1" }],
    cards: [
      {
        id: "card",
        title: "Дом",
        blockId: "scene",
        columnId: "act",
        text: "История",
        drama: 3,
        comments: [],
      },
    ],
  };
  return doc;
}
async function open(page, { theme = "light", zoom = 100, long = false } = {}) {
  await grantPro(page);
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  await page.addInitScript(
    ({ doc, theme }) => {
      localStorage.setItem("tyter.onboarding.v1", "done");
      if (sessionStorage.getItem("ui-polish-seeded")) return;
      localStorage.setItem("tyter.projects.v1", JSON.stringify([doc]));
      localStorage.setItem("tyter.active", doc.id);
      localStorage.setItem("tyter.language.v1", "ru");
      localStorage.setItem(
        "tyter.editor-preferences.v1",
        JSON.stringify({ theme, typewriter: false }),
      );
      sessionStorage.setItem("ui-polish-seeded", "yes");
    },
    { doc: fixture(long, zoom), theme },
  );
  await page.goto("/pro");
  await expect(page.locator(".screenplay-editor")).toBeFocused();
  await page.evaluate(() => document.fonts.ready);
}
const saved = (page) =>
  page.evaluate(async () => {
    const { browserRequest } = await import("/src/browser-files.js");
    return (await browserRequest("documents")).documents.find(
      (doc) => doc.id === "ui-polish",
    );
  });
const settings = (page) =>
  page.getByRole("complementary", { name: "Настройки документа", exact: true });
const firstCard = (page) =>
  page.locator('.comment-card[data-comment-id="comment-1"]');
const openComments = (page) =>
  page.locator(".workspace-tools .comments-toggle").click();

for (const theme of ["light", "dark"]) {
  test(`${theme}: selected text and colored comment text remain readable; card selection stays inside its rounded edge`, async ({
    page,
  }, info) => {
    await open(page, { theme });
    await openComments(page);
    await selectAppOption(
      page,
      firstCard(page).getByRole("combobox", {
        name: "Цвет комментария",
        exact: true,
      }),
      "purple",
    );
    await firstCard(page).locator("p").click();
    const marked = page
      .locator('[data-block-id="action"] .comment-open-selected')
      .first();
    await expect(marked).toHaveAttribute("data-comment-color", "purple");
    const contrast = await marked.evaluate((node) => {
      const context = document
        .createElement("canvas")
        .getContext("2d", { willReadFrequently: true });
      const luminance = (color) => {
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        return [...context.getImageData(0, 0, 1, 1).data]
          .slice(0, 3)
          .map((value) => {
            const c = value / 255;
            return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
          })
          .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
      };
      const ratio = (ink, fill) => {
        const a = luminance(ink),
          b = luminance(fill);
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      };
      const style = getComputedStyle(node),
        selected = getComputedStyle(node, "::selection");
      return {
        comment: ratio(style.color, style.backgroundColor),
        selected: ratio(selected.color, selected.backgroundColor),
      };
    });
    expect(contrast.comment).toBeGreaterThan(4.5);
    expect(contrast.selected).toBeGreaterThan(4.5);
    const shadow = await firstCard(page).evaluate(
      (card) => getComputedStyle(card).boxShadow,
    );
    expect(
      shadow.split(/,(?![^()]*\))/).every((part) => part.includes("inset")),
    ).toBe(true);
    await page.screenshot({ path: info.outputPath(`${theme}-comments.png`) });
    await page.keyboard.press("Escape");
    await page.locator('[data-block-id="action"]').click();
    await page.keyboard.press("Home");
    await page.keyboard.press("Shift+End");
    await expect(page.locator(".selection-toolbar")).toBeVisible();
    await page.screenshot({ path: info.outputPath(`${theme}-selection.png`) });
  });

  test(`${theme}: the entire last page reaches the viewport bottom at 100% and 200%`, async ({
    page,
  }, info) => {
    await open(page, { theme, long: true });
    await expect
      .poll(() => page.locator(".page-guide").count())
      .toBeGreaterThan(2);
    for (const zoom of [100, 200]) {
      if (zoom === 200) {
        await page
          .getByRole("button", { name: "Настройки документа", exact: true })
          .click();
        await page
          .getByRole("slider", { name: "Масштаб документа", exact: true })
          .fill("200");
        await page.keyboard.press("Escape");
      }
      await page.locator(".minimal-scroll").evaluate((scroll) => {
        scroll.scrollTop = scroll.scrollHeight;
      });
      await expect
        .poll(() =>
          page.evaluate(() => {
            const scroll = document.querySelector(".minimal-scroll"),
              paper = document.querySelector(".script-paper");
            return (
              paper.getBoundingClientRect().bottom -
              (scroll.getBoundingClientRect().top + scroll.clientHeight)
            );
          }),
        )
        .toBeCloseTo(0, 0);
      const geometry = await page.locator(".script-paper").evaluate((paper) => {
        const last = paper.querySelector(".screenplay-block:last-child");
        return {
          gap:
            paper.getBoundingClientRect().bottom -
            last.getBoundingClientRect().bottom,
          padding: parseFloat(getComputedStyle(paper).paddingBottom),
        };
      });
      expect(geometry.gap).toBeGreaterThanOrEqual((80 * zoom) / 100);
      expect(geometry.padding).toBeGreaterThanOrEqual(88);
      await page.screenshot({
        path: info.outputPath(`${theme}-bottom-${zoom}.png`),
      });
    }
  });
}

test("comment statuses and colors filter, persist and survive TYT; resolved text cannot open its comment", async ({
  page,
}) => {
  await open(page, { theme: "dark" });
  await openComments(page);
  await selectAppOption(
    page,
    firstCard(page).getByRole("combobox", {
      name: "Статус комментария",
      exact: true,
    }),
    "in-progress",
  );
  await selectAppOption(
    page,
    firstCard(page).getByRole("combobox", {
      name: "Цвет комментария",
      exact: true,
    }),
    "blue",
  );
  await selectAppOption(
    page,
    page.getByRole("combobox", {
      name: "Фильтр по статусу комментария",
      exact: true,
    }),
    "in-progress",
  );
  await expect(page.locator(".comment-card")).toHaveCount(1);
  await expect
    .poll(async () => (await saved(page))?.comments[0]?.status)
    .toBe("in-progress");
  await expect
    .poll(async () => (await saved(page))?.comments[0]?.color)
    .toBe("blue");
  await page.reload();
  await openComments(page);
  await expect(
    firstCard(page).getByRole("combobox", {
      name: "Статус комментария",
      exact: true,
    }),
  ).toHaveAttribute("data-value", "in-progress");
  await expect(
    firstCard(page).getByRole("combobox", {
      name: "Цвет комментария",
      exact: true,
    }),
  ).toHaveAttribute("data-value", "blue");
  for (const status of ["review", "deferred", "resolved"]) {
    await selectAppOption(
      page,
      firstCard(page).getByRole("combobox", {
        name: "Статус комментария",
        exact: true,
      }),
      status,
    );
    if (status === "resolved")
      await page.getByRole("button", { name: "Решённые", exact: true }).click();
    await expect(
      firstCard(page).getByRole("combobox", {
        name: "Статус комментария",
        exact: true,
      }),
    ).toHaveAttribute("data-value", status);
  }
  await expect
    .poll(async () => (await saved(page))?.comments[0]?.resolved)
    .toBe(true);
  const transferred = await page.evaluate(async () => {
    const { browserRequest } = await import("/src/browser-files.js");
    const { exportTYT, readTYT } = await import("/src/tyt-format.js");
    const doc = (await browserRequest("documents")).documents.find(
      (item) => item.id === "ui-polish",
    );
    const result = readTYT(await (await exportTYT(doc)).text()).comments[0];
    return {
      status: result.status,
      resolved: result.resolved,
      color: result.color,
    };
  });
  expect(transferred).toEqual({
    status: "resolved",
    resolved: true,
    color: "blue",
  });
  await page.keyboard.press("Escape");
  await page
    .locator('[data-block-id="action"] [data-comment-id="comment-1"]')
    .first()
    .click();
  await expect(page.locator(".comments-drawer")).toHaveCount(0);
  await expect(
    page.locator('[data-block-id="action"] .comment-open'),
  ).toHaveCount(0);
});

test("comment composer chooses a color and status and legacy imports keep resolved state", async ({
  page,
}) => {
  const legacy = fixture();
  legacy.comments[0].resolved = true;
  legacy.comments[1].status = "unknown";
  legacy.comments[1].color = "url(bad)";
  const clean = validateImport(legacy);
  expect(clean.comments[0]).toMatchObject({
    status: "resolved",
    resolved: true,
    color: "yellow",
  });
  expect(clean.comments[1]).toMatchObject({
    status: "open",
    resolved: false,
    color: "yellow",
  });
  await open(page);
  await openComments(page);
  await page
    .getByLabel("Текст комментария", { exact: true })
    .fill("Новое замечание");
  await selectAppOption(
    page,
    page.getByRole("combobox", {
      name: "Статус нового комментария",
      exact: true,
    }),
    "review",
  );
  await selectAppOption(
    page,
    page.getByRole("combobox", {
      name: "Цвет нового комментария",
      exact: true,
    }),
    "green",
  );
  await page.getByRole("button", { name: "Добавить", exact: true }).click();
  await expect(
    page.locator(".comment-card").filter({ hasText: "Новое замечание" }),
  ).toBeVisible();
  await expect
    .poll(async () => (await saved(page))?.comments.at(-1)?.status)
    .toBe("review");
  await expect
    .poll(async () => (await saved(page))?.comments.at(-1)?.color)
    .toBe("green");
  await page.getByRole("button", { name: "ENG", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Comment status", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("option", { name: "Needs review", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".comments-drawer")).toBeVisible();
});

for (const zoom of [100, 200])
  test(`character button remains reachable while the mouse moves from the name at ${zoom}%`, async ({
    page,
  }) => {
    await open(page, { theme: "dark", zoom });
    const character = page.locator('[data-block-id="anna"]');
    await character.scrollIntoViewIfNeeded();
    await character.hover();
    const button = character.locator(".character-dialogue-link");
    const rect = await button.boundingBox();
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2, {
      steps: 12,
    });
    await expect(button).toHaveCSS("opacity", "1");
    expect(
      await button.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return (
          document
            .elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
            ?.closest("button") === node
        );
      }),
    ).toBe(true);
    await button.click();
    await expect(page.locator(".character-dialogue-view")).toContainText(
      "Доброе утро.",
    );
    await expect(page.locator(".character-dialogue-view")).not.toContainText(
      "До вечера.",
    );
    await page.keyboard.press("Escape");
    await expect(page.locator(".character-dialogue-view")).toHaveCount(0);
  });

test("scene menu matches the interface, works with keyboard and keeps the outline icon clear", async ({
  page,
}, info) => {
  await open(page, { theme: "dark", zoom: 200 });
  const trigger = page.getByRole("combobox", {
    name: "Вариант сцены 1",
    exact: true,
  });
  await trigger.click();
  const menu = page.getByRole("listbox", {
    name: "Вариант сцены 1",
    exact: true,
  });
  await expect(menu).toHaveCSS("border-radius", "10px");
  await expect(menu.getByRole("option")).toHaveCount(6);
  const rect = await menu.boundingBox();
  expect(rect.width).toBe(112);
  expect(rect.x).toBeGreaterThanOrEqual(8);
  await page.screenshot({ path: info.outputPath("dark-scene-menu.png") });
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await expect(trigger).toHaveAttribute("data-value", "F");
  const geometry = await trigger.evaluate((node) => {
    const style = getComputedStyle(node),
      rect = node.getBoundingClientRect(),
      icon = node.parentElement
        .querySelector(".outline-scene-link")
        .getBoundingClientRect();
    return {
      right: style.paddingRight,
      left: style.paddingLeft,
      gap: style.gap,
      width: node.offsetWidth,
      iconGap: icon.left - rect.right,
    };
  });
  expect(geometry).toMatchObject({
    right: "8px",
    left: "8px",
    gap: "4px",
    iconGap: 32,
  });
  await trigger.click();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("settings menus, switches, fonts, author fields and scale retain behavior in both themes", async ({
  page,
}, info) => {
  await open(page);
  await page
    .getByRole("button", { name: "Настройки документа", exact: true })
    .click();
  const theme = page.getByRole("combobox", {
    name: "Тема интерфейса",
    exact: true,
  });
  await theme.click();
  await page.keyboard.press("Escape");
  await expect(settings(page)).toBeVisible();
  await expect(theme).toBeFocused();
  await selectAppOption(page, theme, "dark");
  await page.getByLabel("Звук печатной машинки", { exact: true }).check();
  await page.getByLabel("Подсветка орфографии", { exact: true }).check();
  await selectAppOption(
    page,
    page.getByRole("combobox", { name: "Шрифт в редакторе", exact: true }),
    "courier-new",
  );
  await page.getByLabel("Масштаб документа", { exact: true }).fill("150");
  await page.getByLabel("Автор", { exact: true }).fill("Анна Автор");
  await page.getByLabel("Год", { exact: true }).fill("2026");
  await page
    .getByLabel("Email автора", { exact: true })
    .fill("author@example.test");
  await expect
    .poll(async () => (await saved(page))?.metadata?.author)
    .toBe("Анна Автор");
  await settings(page)
    .locator(".settings-scroll")
    .evaluate((node) => {
      node.scrollTop = 0;
    });
  await page.screenshot({ path: info.outputPath("dark-settings.png") });
  await page.reload();
  await page
    .getByRole("button", { name: "Настройки документа", exact: true })
    .click();
  await expect(
    page.getByLabel("Звук печатной машинки", { exact: true }),
  ).toBeChecked();
  await expect(
    page.getByLabel("Подсветка орфографии", { exact: true }),
  ).toBeChecked();
  await expect(theme).toHaveAttribute("data-value", "dark");
  await expect(
    page.getByLabel("Масштаб документа", { exact: true }),
  ).toHaveValue("150");
  await selectAppOption(page, theme, "light");
  await page.screenshot({ path: info.outputPath("light-settings.png") });
});

import { test, expect } from "@playwright/test";
import { createProject } from "../src/data.js";
import { grantPro } from "./helpers/pro-access.js";

const makeFixture = () => {
  const document = createProject("Карточки истории");
  document.id = "outline-drag-test";
  const rows = [
    ["a", "one", "Сцена А"],
    ["hidden", "one", "Отдельная история"],
    ["b", "one", "Сцена Б"],
    ["c", "one", "Сцена В"],
    ["d", "two", "Сцена Г"],
  ];
  document.outline = {
    columns: [
      { id: "one", title: "Акт 1" },
      { id: "two", title: "Акт 2" },
      { id: "three", title: "Акт 3" },
    ],
    cards: rows.map(([id, columnId, title]) => ({
      id,
      columnId,
      title,
      text: "Независимое описание " + id,
      blockId: "scene-" + id,
      color: "#1b2eff",
      comments: [
        {
          id: "comment-" + id,
          text: "Комментарий " + id,
          createdAt: "2026-09-30T12:00:00.000Z",
        },
      ],
    })),
  };
  const paragraph = (format, text, blockId) => ({
    type: "paragraph",
    attrs: { format, blockId },
    content: [{ type: "text", text }],
  });
  document.content.content = rows.flatMap(([id]) => [
    ...(id === "c"
      ? [
          {
            type: "paragraph",
            attrs: { format: "action", blockId: "full-page" },
            content: Array.from({ length: 44 }, (_, index) => [
              ...(index ? [{ type: "hardBreak" }] : []),
              { type: "text", text: "На улице начинается дождь." },
            ]).flat(),
          },
        ]
      : []),
    paragraph("scene", "ИНТ. НОВАЯ СЦЕНА — ДЕНЬ", "scene-" + id),
    paragraph("action", "Текст сценария " + id, "action-" + id),
  ]);
  return document;
};

test.beforeEach(async ({ page }) => {
  await grantPro(page);
  await page.addInitScript((document) => {
    localStorage.setItem("tyter.projects.v1", JSON.stringify([document]));
    localStorage.setItem("tyter.active", document.id);
  }, makeFixture());
  await page.goto("/pro");
  await expect(page.locator(".screenplay-editor")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
});

const stored = (page) =>
  page.evaluate(async () => {
    const { browserRequest } = await import("/src/browser-files.js");
    return (await browserRequest("documents")).documents[0];
  });
const column = (page, id) =>
  page.locator('.outline-column[data-column-id="' + id + '"]');
const card = (page, id) =>
  page.locator('.outline-card[data-card-id="' + id + '"]');
const order = (page, id) =>
  column(page, id)
    .locator(".outline-card")
    .evaluateAll((items) => items.map((item) => item.dataset.cardId));
async function drag(page, source, target, after = false) {
  const box = await card(page, target).boundingBox();
  await card(page, source)
    .locator(".outline-card-title")
    .dragTo(card(page, target), {
      sourcePosition: { x: 30, y: 18 },
      targetPosition: { x: 100, y: after ? box.height - 5 : 5 },
    });
}

test("cards reorder in an act, move to precise positions in other acts, and persist", async ({
  page,
}) => {
  await expect
    .poll(async () => (await stored(page))?.outline?.cards?.length)
    .toBe(5);
  const original = await stored(page);
  await page.getByRole("button", { name: "Аутлайн", exact: true }).click();
  await drag(page, "c", "a");
  await expect
    .poll(() => order(page, "one"))
    .toEqual(["c", "a", "hidden", "b"]);
  await drag(page, "c", "b", true);
  await expect
    .poll(() => order(page, "one"))
    .toEqual(["a", "hidden", "b", "c"]);
  await card(page, "b").locator(".outline-card-title").click();
  await drag(page, "b", "d");
  await expect.poll(() => order(page, "two")).toEqual(["b", "d"]);
  await expect(page.getByLabel("Акт карточки")).toHaveValue("two");
  await drag(page, "c", "d", true);
  await expect.poll(() => order(page, "two")).toEqual(["b", "d", "c"]);
  await card(page, "b")
    .locator(".outline-card-text")
    .dragTo(column(page, "three").locator(".outline-card-list"));
  await expect.poll(() => order(page, "three")).toEqual(["b"]);
  await expect.poll(() => order(page, "two")).toEqual(["d", "c"]);
  await expect(page.locator(".is-dragging, .is-drop-target")).toHaveCount(0);
  await expect
    .poll(
      async () =>
        (await stored(page)).outline.cards.find((item) => item.id === "b")
          .columnId,
    )
    .toBe("three");
  const updated = await stored(page);
  expect(updated.content).toEqual(original.content);
  for (const item of updated.outline.cards) {
    const before = original.outline.cards.find((card) => card.id === item.id);
    expect(item).toMatchObject({
      blockId: before.blockId,
      text: before.text,
      comments: before.comments,
      color: before.color,
    });
  }
  await page.reload();
  await page.getByRole("button", { name: "Аутлайн", exact: true }).click();
  await expect.poll(() => order(page, "one")).toEqual(["a", "hidden"]);
  await expect.poll(() => order(page, "two")).toEqual(["d", "c"]);
  await expect.poll(() => order(page, "three")).toEqual(["b"]);
  await page
    .getByRole("button", { name: "Перейти к сцене Сцена Б", exact: true })
    .click();
  await expect(page.locator('[data-block-id="scene-b"]')).toBeInViewport();
  await page
    .getByRole("button", { name: "Открыть карточку Сцена Б", exact: true })
    .click();
  await expect(page.getByLabel("Акт карточки")).toHaveValue("three");
});

test("reordering search results preserves hidden cards", async ({ page }) => {
  await page.getByRole("button", { name: "Аутлайн", exact: true }).click();
  await page.getByLabel("Поиск карточек", { exact: true }).fill("Сцена");
  await expect.poll(() => order(page, "one")).toEqual(["a", "b", "c"]);
  await drag(page, "c", "b");
  await expect.poll(() => order(page, "one")).toEqual(["a", "c", "b"]);
  await page.getByLabel("Поиск карточек", { exact: true }).fill("");
  await expect
    .poll(() => order(page, "one"))
    .toEqual(["a", "hidden", "c", "b"]);
  await expect
    .poll(async () => (await stored(page))?.outline?.cards?.length)
    .toBe(5);
});

test("a drag previews its insertion point and can be cancelled", async ({
  page,
}, info) => {
  await page.getByRole("button", { name: "Аутлайн", exact: true }).click();
  const source = await card(page, "c")
    .locator(".outline-card-title")
    .boundingBox();
  const target = await card(page, "a").boundingBox();
  await page.mouse.move(source.x + 30, source.y + 18);
  await page.mouse.down();
  await page.mouse.move(source.x + 40, source.y + 18);
  await page.mouse.move(target.x + 100, target.y + 5, { steps: 10 });
  await page.mouse.move(target.x + 101, target.y + 5);
  await expect(card(page, "c")).toHaveClass(/is-dragging/);
  await expect(card(page, "a")).toHaveClass(/drop-before/);
  await page.screenshot({ path: info.outputPath("outline-drag-preview.png") });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(
    page.locator(".is-dragging, .is-drop-target, .drop-before, .drop-after"),
  ).toHaveCount(0);
  await expect
    .poll(() => order(page, "one"))
    .toEqual(["a", "hidden", "b", "c"]);
  await expect
    .poll(async () => (await stored(page)).outline.cards.map((item) => item.id))
    .toEqual(["a", "hidden", "b", "c", "d"]);
});

test("scene numbers and enlarged links center on the heading, including paginated scenes", async ({
  page,
}, info) => {
  const scenes = page.locator('.screenplay-editor p[data-format="scene"]');
  async function aligned() {
    return scenes.evaluateAll((elements) =>
      elements.map((element) => {
        const walker = document.createTreeWalker(
          element,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode: (node) =>
              node.parentElement.closest(".ProseMirror-widget")
                ? NodeFilter.FILTER_REJECT
                : NodeFilter.FILTER_ACCEPT,
          },
        );
        const text = walker.nextNode();
        const range = document.createRange();
        range.setStart(text, 0);
        range.setEnd(text, 1);
        const rect = range.getBoundingClientRect();
        const titleCenter = (rect.top + rect.bottom) / 2;
        const box = element.getBoundingClientRect();
        const number = element
          .querySelector(".scene-number")
          .getBoundingClientRect();
        const paper = element.closest(".script-paper").getBoundingClientRect();
        const variant = element
          .querySelector(".scene-variant-select")
          .getBoundingClientRect();
        const link = element.querySelector(".outline-scene-link");
        const icon = link.getBoundingClientRect();
        return {
          numberError: Math.abs((number.top + number.bottom) / 2 - titleCenter),
          left: number.left - paper.left,
          variantGap: variant.left - number.right,
          gap: icon.left - variant.right,
          linkError: Math.abs((icon.top + icon.bottom) / 2 - titleCenter),
          position: getComputedStyle(link.parentElement).position,
          width: icon.width,
          height: icon.height,
          overlapsText: icon.right > box.left + 1,
        };
      }),
    );
  }
  async function assertAligned(scale = 1) {
    await expect
      .poll(async () =>
        (await aligned()).every(
          (item) =>
            item.position === "absolute" &&
            item.numberError < 2 * scale &&
            Math.abs(item.left - 16 * scale) < 1 &&
            Math.abs(item.variantGap - 16 * scale) < 1 &&
            Math.abs(item.gap - 16 * scale) < 1 &&
            item.linkError < 2 * scale &&
            item.width === 34 * scale &&
            item.height === 34 * scale &&
            !item.overlapsText,
        ),
      )
      .toBe(true);
  }
  await assertAligned();
  await expect
    .poll(() =>
      page
        .locator('[data-block-id="scene-c"]')
        .evaluate(
          (element) =>
            parseFloat(
              getComputedStyle(element).getPropertyValue("--page-padding"),
            ) || 0,
        ),
    )
    .toBeGreaterThan(0);
  await page
    .getByRole("button", { name: "Настройки документа", exact: true })
    .click();
  await page.getByLabel("Масштаб документа", { exact: true }).press("End");
  await page.getByRole("button", { name: "Закрыть настройки" }).click();
  await assertAligned(2);
  await page.setViewportSize({ width: 390, height: 844 });
  await assertAligned(2);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await assertAligned(2);
  const button = page.getByRole("button", {
    name: "Открыть карточку Сцена А",
    exact: true,
  });
  await button.scrollIntoViewIfNeeded();
  await button.hover();
  await expect(button).toHaveCSS("background-color", "rgb(232, 234, 255)");
  await page.screenshot({ path: info.outputPath("scene-alignment.png") });
  // Clicking near the corner checks the complete 34px hit area, outside the 16px icon.
  await button.click({ position: { x: 2, y: 2 } });
  await expect(page.getByLabel("Название карточки")).toHaveValue("Сцена А");
});

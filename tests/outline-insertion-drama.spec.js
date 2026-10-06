import { test, expect } from "@playwright/test";
import { createProject } from "../src/data.js";
import { grantPro } from "./helpers/pro-access.js";

const paragraph = (id, text, format = "action") => ({
  type: "paragraph",
  attrs: { blockId: id, format },
  content: text ? [{ type: "text", text }] : undefined,
});
const editor = (page) => page.locator(".screenplay-editor");
const stored = (page) =>
  page.evaluate(async () => {
    const { browserRequest } = await import("/src/browser-files.js");
    return (await browserRequest("documents")).documents[0];
  });
async function open(page, project) {
  await grantPro(page);
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  await page.addInitScript((project) => {
    if (sessionStorage.getItem("insertion-seeded")) return;
    localStorage.setItem("tyter.projects.v1", JSON.stringify([project]));
    localStorage.setItem("tyter.active", project.id);
    localStorage.setItem("tyter.language.v1", "ru");
    sessionStorage.setItem("insertion-seeded", "true");
  }, project);
  await page.goto("/pro");
  await expect(editor(page)).toBeFocused();
  await page.evaluate(() => document.fonts.ready);
}
async function select(page, blockId, start, end = start) {
  const line = editor(page).locator(`p[data-block-id="${blockId}"]`);
  await line.scrollIntoViewIfNeeded();
  await line.evaluate(
    (node, { start, end }) => {
      node.closest("[contenteditable]").focus();
      const point = (offset) => {
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
        let text;
        while ((text = walker.nextNode())) {
          if (offset <= text.length) return [text, offset];
          offset -= text.length;
        }
        return [node, node.childNodes.length];
      };
      const range = document.createRange();
      range.setStart(...point(start));
      range.setEnd(...point(end));
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
    },
    { start, end },
  );
  await page.keyboard.press("Shift");
}

for (const zoom of [100, 200])
  test(`outline: reinsert a deleted scene at the remembered caret and navigate at ${zoom}%`, async ({
    page,
  }) => {
    const project = createProject("Повторная вставка");
    project.metadata.documentZoom = zoom;
    project.content.content = Array.from({ length: 30 }, (_, i) =>
      paragraph(`line-${i}`, "Текст перед сценой. ".repeat(6)),
    );
    project.content.content[15] = paragraph("caret", "До курсораПосле курсора");
    project.outline = {
      columns: [{ id: "act", title: "Акт 1" }],
      cards: [
        {
          id: "card",
          columnId: "act",
          blockId: "deleted-scene",
          title: "ИНТ. КУХНЯ — ДЕНЬ",
          text: "Лампа горит.",
          drama: 4,
          color: "#d89b17",
          comments: [],
        },
      ],
    };
    await open(page, project);
    await select(page, "caret", "До курсора".length);
    await page.keyboard.press("Alt+2");
    const locate = page.getByRole("button", {
      name: "Перейти к сцене ИНТ. КУХНЯ — ДЕНЬ",
      exact: true,
    });
    await expect(locate).toHaveAttribute(
      "data-tooltip",
      "Сцена удалена · вставить снова",
    );
    await locate.click();
    const scene = editor(page).locator('p[data-format="scene"]');
    await expect(editor(page)).toBeFocused();
    await expect(scene).toHaveText("ИНТ. КУХНЯ — ДЕНЬ");
    await expect
      .poll(async () => {
        const texts = await editor(page).locator("p").allTextContents();
        const at = texts.indexOf("ИНТ. КУХНЯ — ДЕНЬ");
        return texts.slice(at - 1, at + 3);
      })
      .toEqual([
        "До курсора",
        "ИНТ. КУХНЯ — ДЕНЬ",
        "Лампа горит.",
        "После курсора",
      ]);
    await expect
      .poll(() =>
        scene.evaluate((node) => {
          const bounds = node.getBoundingClientRect();
          const scroll = node
            .closest(".minimal-scroll")
            .getBoundingClientRect();
          return bounds.top >= scroll.top && bounds.bottom <= scroll.bottom;
        }),
      )
      .toBe(true);
    await page.keyboard.insertText("X");
    await expect(scene).toHaveText("XИНТ. КУХНЯ — ДЕНЬ");
    const id = await scene.getAttribute("data-block-id");
    await expect
      .poll(async () => (await stored(page))?.outline.cards[0].blockId)
      .toBe(id);
    const ids = await editor(page)
      .locator("p")
      .evaluateAll((nodes) => nodes.map((node) => node.dataset.blockId));
    expect(new Set(ids).size).toBe(ids.length);
    // A later target click must focus the scene again, rather than a stale cursor.
    await select(page, "line-29", 4);
    await page.keyboard.press("Alt+2");
    await locate.click();
    await expect(editor(page)).toBeFocused();
    await page.keyboard.insertText("Y");
    await expect(scene).toHaveText("YXИНТ. КУХНЯ — ДЕНЬ");
    await expect(editor(page).locator('p[data-format="scene"]')).toHaveCount(1);
  });

test("drama: dragging points updates cards live, clamps 0–10 and survives reload", async ({
  page,
}, info) => {
  const project = createProject("Перетаскивание графика");
  project.outline = {
    columns: [{ id: "act", title: "Акт 1" }],
    cards: [
      {
        id: "first",
        columnId: "act",
        title: "Первая карточка",
        text: "Текст",
        drama: 4,
        color: "#d89b17",
        comments: [{ id: "note", text: "Заметка" }],
      },
      {
        id: "second",
        columnId: "act",
        title: "Вторая карточка",
        drama: 6,
        color: "#1b2eff",
        comments: [],
      },
    ],
  };
  await open(page, project);
  await page.keyboard.press("Alt+2");
  await page
    .getByRole("button", { name: "График драматичности", exact: true })
    .click();
  const point = page.locator(".outline-drama-point").first();
  const slider = page.getByLabel("Драматичность карточки", { exact: true });
  const dragPoint = async (delta) => {
    const dot = await point.locator("circle").boundingBox();
    const unit = await point.evaluate((node) => {
      const svg = node.ownerSVGElement;
      const height = svg.viewBox.baseVal.height;
      return (
        (((height - 70) / 10) * svg.getBoundingClientRect().height) / height
      );
    });
    await page.mouse.move(dot.x + dot.width / 2, dot.y + dot.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      dot.x + dot.width / 2,
      dot.y + dot.height / 2 - delta * unit,
      { steps: 12 },
    );
    return () => page.mouse.up();
  };
  // Starting with no sidebar exercises pointer capture while the chart resizes.
  let release = await dragPoint(3);
  await expect(slider).toHaveValue("7");
  await expect(point).toHaveAttribute(
    "aria-label",
    "Первая карточка: драматичность 7 из 10",
  );
  await release();
  release = await dragPoint(-15);
  await expect(slider).toHaveValue("0");
  await release();
  release = await dragPoint(12);
  await expect(slider).toHaveValue("10");
  await release();
  // Full-height click targets still select without changing the value.
  await point.locator(".drama-hit-area").click({ position: { x: 10, y: 110 } });
  await expect(slider).toHaveValue("10");
  await expect
    .poll(async () => (await stored(page)).outline.cards[0].drama)
    .toBe(10);
  expect((await stored(page)).outline.cards[0]).toMatchObject({
    color: "#d89b17",
    text: "Текст",
    comments: [{ id: "note", text: "Заметка" }],
  });
  await page.screenshot({ path: info.outputPath("drama-drag.png") });
  await page.reload();
  await expect(editor(page)).toBeFocused();
  await page.keyboard.press("Alt+2");
  await page.locator('[data-card-id="first"] .outline-card-title').click();
  await expect(slider).toHaveValue("10");
});

test("document annotations: create a component immediately in its sidebar, then pair its prop without a popup", async ({
  page,
}) => {
  const project = createProject("Аннотации из текста");
  project.content.content = [paragraph("text", "Лампа стоит. Лампа горит.")];
  await open(page, project);
  await select(page, "text", 0, 5);
  await page.keyboard.press("Control+d");
  const components = page.getByRole("complementary", {
    name: "Компоненты сценария",
  });
  await expect(components.getByLabel("Название", { exact: true })).toHaveValue(
    "Лампа",
  );
  await expect(
    components.getByLabel("Название", { exact: true }),
  ).toBeFocused();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(editor(page).locator("[data-entity-id]")).toHaveCount(2);
  await components
    .getByLabel("Описание", { exact: false })
    .fill("Практический свет");
  await page.keyboard.press("Control+Enter");
  await page.keyboard.press("Escape");
  await select(page, "text", 0, 5);
  await page.keyboard.press("Control+e");
  const annotations = page.getByRole("complementary", {
    name: "Компонент и реквизит",
  });
  await expect(annotations).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await annotations.getByLabel("Количество реквизита").fill("3");
  await annotations
    .getByRole("button", { name: "Сохранить", exact: true })
    .last()
    .click();
  await expect
    .poll(async () => (await stored(page))?.props[0]?.quantity)
    .toBe(3);
  expect((await stored(page)).components).toHaveLength(1);
  expect((await stored(page)).props).toHaveLength(1);
  expect((await stored(page)).components[0].description).toBe(
    "Практический свет",
  );
  expect((await stored(page)).props[0].componentId).toBe(
    (await stored(page)).components[0].id,
  );
});

test("document props: selection toolbar creates immediately in the editing sidebar and reopens the existing item", async ({
  page,
}) => {
  const project = createProject("Реквизит из текста");
  project.content.content = [paragraph("text", "Лампа стоит. Лампа горит.")];
  await open(page, project);
  await select(page, "text", 0, 5);
  await page
    .getByRole("button", { name: "Создать реквизит из выделения" })
    .click();
  const props = page.getByRole("complementary", { name: "Реквизит сценария" });
  await expect(props.getByLabel("Название", { exact: true })).toHaveValue(
    "Лампа",
  );
  await expect(props.getByLabel("Название", { exact: true })).toBeFocused();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(editor(page).locator("[data-prop-id]")).toHaveCount(2);
  await props.getByLabel("Количество реквизита").fill("2");
  await props.getByLabel("Описание", { exact: false }).fill("Для съёмок");
  await props.getByRole("button", { name: "Сохранить", exact: true }).click();
  await page.keyboard.press("Escape");
  await select(page, "text", 13, 18);
  await page.keyboard.press("Control+e");
  await expect(props.getByLabel("Количество реквизита")).toHaveValue("2");
  await expect(props.getByLabel("Описание", { exact: false })).toHaveValue(
    "Для съёмок",
  );
  await expect.poll(async () => (await stored(page))?.props.length).toBe(1);
});

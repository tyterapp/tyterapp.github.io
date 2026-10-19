import { test, expect } from "@playwright/test";
import { createProject } from "../src/data.js";
import { grantPro } from "./helpers/pro-access.js";

const paragraph = (id, text, format = "action") => ({
  type: "paragraph",
  attrs: { blockId: id, format },
  content: text ? [{ type: "text", text }] : undefined,
});
const editor = (page) => page.locator(".screenplay-editor");
const paragraphText = (node) => {
  const copy = node.cloneNode(true);
  copy
    .querySelectorAll('[contenteditable="false"]')
    .forEach((control) => control.remove());
  return copy.textContent;
};
const sceneText = (scene) => scene.evaluate(paragraphText);
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

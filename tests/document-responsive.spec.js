import { test, expect } from "@playwright/test";
import { createProject } from "../src/data.js";
import { grantPro } from "./helpers/pro-access.js";

const paragraph = (format, text, blockId) => ({
  type: "paragraph",
  attrs: { format, blockId },
  content: [{ type: "text", text }],
});
function fixture(zoom = 100, long = false) {
  const doc = createProject("Адаптивный сценарий");
  doc.id = "responsive-document";
  doc.metadata.documentZoom = zoom;
  doc.content.content = [
    paragraph("scene", "ИНТ. ДОМ — ДЕНЬ", "scene"),
    ...Array.from({ length: long ? 20 : 2 }, (_, index) =>
      paragraph(
        "action",
        "Героиня смотрит в окно. ".repeat(12),
        `action-${index}`,
      ),
    ),
    paragraph("character", "АННА", "anna"),
    paragraph("speech", "Привет. Сегодня прекрасный день.", "speech"),
  ];
  doc.outline = {
    columns: [{ id: "act", title: "Акт 1" }],
    cards: [
      {
        id: "card",
        columnId: "act",
        blockId: "scene",
        title: "Дом",
        text: "",
        comments: [],
      },
    ],
  };
  return doc;
}
async function open(page, doc, theme) {
  await grantPro(page);
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  await page.addInitScript(
    ({ doc, theme }) => {
      localStorage.setItem("tyter.onboarding.v1", "done");
      localStorage.setItem("tyter.projects.v1", JSON.stringify([doc]));
      localStorage.setItem("tyter.active", doc.id);
      localStorage.setItem("tyter.language.v1", "ru");
      localStorage.setItem(
        "tyter.editor-preferences.v1",
        JSON.stringify({ theme }),
      );
    },
    { doc, theme },
  );
  await page.goto("/beta");
  await expect(page.locator(".screenplay-editor")).toBeFocused();
  await page.evaluate(() => document.fonts.ready);
}
const geometry = (page) =>
  page.locator(".script-paper").evaluate((paper) => {
    const scroll = paper.closest(".minimal-scroll");
    const box = paper.getBoundingClientRect();
    const viewport = scroll.getBoundingClientRect();
    const heading = paper
      .querySelector('[data-block-id="scene"]')
      .getBoundingClientRect();
    const gutter = paper.querySelector(".scene-gutter").getBoundingClientRect();
    return {
      width: box.width,
      available: scroll.clientWidth - 80,
      left: box.left - viewport.left,
      right: viewport.left + scroll.clientWidth - box.right,
      gutterRight: gutter.right,
      textLeft: heading.left,
      scrollWidth: scroll.scrollWidth,
      viewportWidth: scroll.clientWidth,
      pages: paper.querySelectorAll(".page-guide").length,
    };
  });

for (const theme of ["light", "dark"]) {
  test(`${theme}: the document fits with 40px margins and a visible 580px minimum at every zoom`, async ({
    page,
  }, info) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width: 2600, height: 1000 });
    await open(page, fixture(), theme);
    await page
      .getByRole("button", { name: "Настройки документа", exact: true })
      .click();
    const scale = page.getByRole("slider", {
      name: "Масштаб документа",
      exact: true,
    });
    for (let zoom = 100; zoom <= 200; zoom += 10) {
      await page.setViewportSize({ width: 2600, height: 1000 });
      await scale.fill(String(zoom));
      await expect
        .poll(async () => (await geometry(page)).width)
        .toBeCloseTo((936 * zoom) / 100, 0);
      // On either side of the threshold, the paper only starts shrinking at 40px.
      const outside = 2600 - (await geometry(page)).viewportWidth;
      const threshold = (936 * zoom) / 100 + 80 + outside;
      await page.setViewportSize({
        width: Math.ceil(threshold + 20),
        height: 1000,
      });
      await expect
        .poll(async () => (await geometry(page)).width)
        .toBeCloseTo((936 * zoom) / 100, 0);
      await page.setViewportSize({
        width: Math.floor(threshold - 20),
        height: 1000,
      });
      await expect
        .poll(async () => {
          const box = await geometry(page);
          return Math.abs(box.width - box.available);
        })
        .toBeLessThan(1);
      const fitted = await geometry(page);
      expect(fitted.left).toBeCloseTo(40, 0);
      expect(fitted.right).toBeCloseTo(40, 0);
      await page.setViewportSize({ width: 1000, height: 1000 });
      await expect
        .poll(async () => (await geometry(page)).width)
        .toBeCloseTo(580, 0);
      const narrow = await geometry(page);
      expect(narrow.gutterRight).toBeLessThan(narrow.textLeft - 8);
      expect(narrow.scrollWidth).toBeGreaterThan(narrow.viewportWidth);
      await expect(page.locator(".script-paper")).toHaveCSS(
        "zoom",
        String(zoom / 100),
      );
    }
    await page.getByRole("button", { name: "Закрыть настройки" }).click();
    await page.setViewportSize({ width: 1100, height: 1000 });
    await page.screenshot({ path: info.outputPath("responsive-document.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(async () => (await geometry(page)).width)
      .toBeCloseTo(390, 0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(390);
    expect((await geometry(page)).scrollWidth).toBe(
      (await geometry(page)).viewportWidth,
    );
    await page.emulateMedia({ media: "print" });
    await expect(page.locator(".script-paper")).toHaveCSS("zoom", "1");
    await expect
      .poll(
        async () => (await page.locator(".script-paper").boundingBox()).width,
      )
      .toBeCloseTo(936, 0);
  });
}

test("resizing at 130% repaginates wrapped text in both directions and preserves the caret", async ({
  page,
}, info) => {
  const doc = fixture(130, true);
  await page.setViewportSize({ width: 2000, height: 1000 });
  await open(page, doc, "dark");
  await expect
    .poll(() => page.locator(".page-guide").count())
    .toBeGreaterThan(1);
  const originalPages = (await geometry(page)).pages;
  const first = page.locator('[data-block-id="action-0"]');
  await first.evaluate((node) => {
    const range = document.createRange();
    range.setStart(node.firstChild, 5);
    range.collapse(true);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await page.setViewportSize({ width: 832, height: 1000 });
  await expect
    .poll(async () => (await geometry(page)).pages)
    .toBeGreaterThan(originalPages);
  const overflow = () =>
    page.locator(".script-paper").evaluate((paper) => {
      const scale = Number(getComputedStyle(paper).zoom);
      const origin = paper.getBoundingClientRect().top;
      const pageHeight = Number.parseFloat(
        paper.querySelector(".page-guide").style.height,
      );
      const margin = Number.parseFloat(
        paper.style.getPropertyValue("--page-margin"),
      );
      const walker = document.createTreeWalker(
        paper.querySelector(".screenplay-editor"),
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node) =>
            node.parentElement.closest(
              '[contenteditable="false"], .ProseMirror-widget',
            )
              ? NodeFilter.FILTER_REJECT
              : NodeFilter.FILTER_ACCEPT,
        },
      );
      let node;
      const errors = [];
      while ((node = walker.nextNode())) {
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const rect of range.getClientRects()) {
          if (!rect.width || !rect.height) continue;
          const top = (rect.top - origin) / scale;
          const bottom = (rect.bottom - origin) / scale;
          const page = Math.floor(top / pageHeight);
          if (
            top < page * pageHeight + margin - 1 ||
            bottom > (page + 1) * pageHeight - margin + 1
          )
            errors.push({ top, bottom });
        }
      }
      return errors;
    });
  await expect.poll(overflow).toEqual([]);
  await page.screenshot({ path: info.outputPath("narrow-pagination.png") });
  await page.setViewportSize({ width: 2000, height: 1000 });
  await expect
    .poll(async () => (await geometry(page)).pages)
    .toBe(originalPages);
  await expect.poll(overflow).toEqual([]);
  await page.keyboard.insertText("!");
  const original = doc.content.content[1].content[0].text;
  await expect(first).toHaveText(
    original.slice(0, 5) + "!" + original.slice(5),
  );
  await page
    .getByRole("button", { name: "Открыть во весь экран", exact: true })
    .click();
  await page.setViewportSize({ width: 1000, height: 1000 });
  await expect
    .poll(async () => (await geometry(page)).width)
    .toBeCloseTo(920, 0);
  await expect.poll(async () => (await geometry(page)).left).toBeCloseTo(40, 0);
});

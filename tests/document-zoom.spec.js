import { test, expect } from "@playwright/test";
import { createProject } from "../src/data.js";

const paragraph = (format, text, blockId) => ({
  type: "paragraph",
  attrs: { format, blockId },
  content: [{ type: "text", text }],
});
const fixture = (long = false) => {
  const document = createProject("Масштаб сценария");
  document.id = "zoom-document";
  document.content.content = [
    paragraph("scene", "ИНТ. ДОМ — ДЕНЬ", "scene"),
    ...Array.from({ length: long ? 60 : 3 }, (_, index) =>
      paragraph("action", "Героиня стоит у окна. ".repeat(5), "text-" + index),
    ),
  ];
  return document;
};
const editor = (page) =>
  page.getByRole("textbox", { name: "Screenplay editor" });
const settings = (page) =>
  page.getByRole("complementary", { name: "Настройки документа", exact: true });
const scale = (page) =>
  settings(page).getByRole("slider", {
    name: "Масштаб документа",
    exact: true,
  });

async function open(page, document) {
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ json: { documents: [] } }),
  );
  await page.addInitScript((document) => {
    localStorage.setItem("tyter.onboarding.v1", "done");
    if (sessionStorage.getItem("zoom-seeded")) return;
    localStorage.setItem("tyter.projects.v1", JSON.stringify([document]));
    localStorage.setItem("tyter.active", document.id);
    sessionStorage.setItem("zoom-seeded", "true");
  }, document);
  await page.goto("/free");
  await expect(editor(page)).toBeFocused();
  await page.evaluate(() => document.fonts.ready);
  await page
    .getByRole("button", { name: "Настройки документа", exact: true })
    .click();
}

const geometry = (page) =>
  page.evaluate(() => {
    const paper = document.querySelector(".script-paper");
    const block = document.querySelector('[data-block-id="text-0"]');
    const box = paper.getBoundingClientRect();
    const text = block.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(block);
    return {
      width: box.width,
      height: box.height,
      margin: text.left - box.left,
      textHeight: text.height,
      lines: range.getClientRects().length,
      pages: document.querySelectorAll(".page-guide").length,
      uiWidth: document
        .querySelector(".settings-drawer")
        .getBoundingClientRect().width,
    };
  });

test("document zoom scales sheet and text together without repagination, UI growth or lost caret", async ({
  page,
}, info) => {
  const document = fixture(true);
  await open(page, document);
  await expect
    .poll(() => page.locator(".page-guide").count())
    .toBeGreaterThan(2);
  const original = await geometry(page);
  await scale(page).fill("200");
  await expect(page.locator(".script-paper")).toHaveCSS("zoom", "2");
  await expect
    .poll(async () => (await geometry(page)).pages)
    .toBe(original.pages);
  const enlarged = await geometry(page);
  expect(enlarged.width).toBeCloseTo(original.width * 2, 0);
  expect(enlarged.height).toBeCloseTo(original.height * 2, 0);
  expect(enlarged.margin).toBeCloseTo(original.margin * 2, 0);
  expect(enlarged.textHeight).toBeCloseTo(original.textHeight * 2, 0);
  expect(enlarged.lines).toBe(original.lines);
  expect(enlarged.uiWidth).toBe(original.uiWidth);
  await expect(page.locator(".minimal-scroll")).toHaveJSProperty(
    "scrollLeft",
    0,
  );
  const paperBox = await page.locator(".script-paper").boundingBox();
  const viewport = await page.locator(".minimal-scroll").boundingBox();
  expect(paperBox.x).toBeGreaterThanOrEqual(viewport.x);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    1440,
  );
  await page.screenshot({ path: info.outputPath("document-200-percent.png") });

  // Zooming preserves the editor's insertion position while settings have focus.
  const first = page.locator('[data-block-id="text-0"]');
  await first.evaluate((node) => {
    node.closest("[contenteditable]").focus();
    const range = document.createRange();
    range.setStart(node.firstChild, 5);
    range.collapse(true);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await page.keyboard.press("Shift");
  await scale(page).fill("150");
  await page.getByRole("button", { name: "Действие", exact: true }).click();
  await expect(editor(page)).toBeFocused();
  await page.keyboard.insertText("!");
  const originalText = document.content.content[1].content[0].text;
  await expect(first).toHaveText(
    originalText.slice(0, 5) + "!" + originalText.slice(5),
  );
  await scale(page).fill("200");
  await expect(page.getByRole("banner").getByRole("status")).toHaveText(
    "Сохранено на устройстве",
  );

  // A new document starts at 100%, and the older document keeps its own zoom.
  await page.getByRole("button", { name: "Документы", exact: true }).click();
  await page
    .getByRole("button", { name: "Новый сценарий", exact: true })
    .click();
  await expect(editor(page)).toBeFocused();
  await expect(page.locator(".script-paper")).toHaveCSS("zoom", "1");
  await page.getByRole("button", { name: "Документы", exact: true }).click();
  await page
    .locator(".document-item")
    .filter({ hasText: "Масштаб сценария" })
    .click();
  await expect(page.locator(".script-paper")).toHaveCSS("zoom", "2");
  await page.reload();
  await expect(page.locator(".script-paper")).toHaveCSS("zoom", "2");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBe(390);
  await expect
    .poll(() =>
      page
        .locator(".script-paper")
        .evaluate((node) => node.getBoundingClientRect().width),
    )
    .toBeCloseTo(1712, 0);
  await expect
    .poll(() => page.locator(".page-guide").count())
    .toBe(original.pages);
  await page.screenshot({
    path: info.outputPath("document-200-percent-mobile.png"),
  });
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".script-paper")).toHaveCSS("zoom", "1");
});

test("document zoom survives TYT import and keeps the exported PDF at its original size", async ({
  page,
}) => {
  await open(page, fixture());
  const result = await page.evaluate(async (document) => {
    const { exportPDF } = await import("/src/exports.js");
    const { readTYT, tytPayload } = await import("/src/tyt-format.js");
    const pdfjs = await import("/node_modules/.vite/deps/pdfjs-dist.js");
    pdfjs.GlobalWorkerOptions.workerSrc =
      "/node_modules/pdfjs-dist/build/pdf.worker.min.mjs";
    const parse = async (document) => {
      const task = pdfjs.getDocument({
        data: new Uint8Array(await (await exportPDF(document)).arrayBuffer()),
      });
      const pdf = await task.promise;
      const first = await pdf.getPage(1);
      const viewport = first.getViewport({ scale: 1 });
      const text = await first.getTextContent();
      const result = {
        width: viewport.width,
        height: viewport.height,
        pages: pdf.numPages,
        lines: text.items
          .filter((item) => item.str?.trim())
          .map((item) => ({
            text: item.str,
            transform: item.transform,
            width: item.width,
          })),
      };
      await task.destroy();
      return result;
    };
    const original = await parse(document);
    const restored = readTYT(
      JSON.stringify(
        tytPayload({
          ...document,
          metadata: { ...document.metadata, documentZoom: 200 },
        }),
      ),
    );
    const enlarged = await parse(restored);
    return {
      zoom: restored.metadata.documentZoom,
      fontSize: restored.metadata.fontSize,
      original,
      enlarged,
    };
  }, fixture());
  expect(result.zoom).toBe(200);
  expect(result.fontSize).toBe(12);
  expect(result.enlarged).toEqual(result.original);
  expect(result.enlarged.width).toBe(642);
  expect(result.enlarged.height).toBe(792);
});

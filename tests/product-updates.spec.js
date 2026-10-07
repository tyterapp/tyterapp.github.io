import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";

const fixture = {
  id: "new-product",
  title: "Глазами кошки",
  updatedAt: new Date().toISOString(),
  components: [],
  props: [],
  comments: [],
  content: {
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: { format: "scene", blockId: "scene" },
        content: [{ type: "text", text: "ИНТ. ДОМ — ДЕНЬ" }],
      },
      {
        type: "paragraph",
        attrs: { format: "action", blockId: "action" },
        content: [{ type: "text", text: "Кошкка смотрит на миску." }],
      },
    ],
  },
};
test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ json: { documents: [], directory: "Test" } }),
  );
  await page.addInitScript((doc) => {
    localStorage.setItem("tyter.onboarding.v1", "done");
    localStorage.setItem("tyter.projects.v1", JSON.stringify([doc]));
    localStorage.setItem("tyter.active", doc.id);
  }, fixture);
});
const select = async (page, text) => {
  await page
    .locator(".screenplay-editor p")
    .last()
    .evaluate((element, text) => {
      element.closest("[contenteditable]").focus();
      const node = document
        .createTreeWalker(element, NodeFilter.SHOW_TEXT)
        .nextNode();
      const start = node.textContent.indexOf(text);
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, start + text.length);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
    }, text);
  await page.keyboard.press("Shift");
};
test("context menu preserves selection, applies bold, and disables empty clipboard actions", async ({
  page,
}) => {
  await page.goto("/app");
  await page.evaluate(() => navigator.clipboard.writeText(""));
  await select(page, "миску");
  await page.locator(".screenplay-editor p").last().click({ button: "right" });
  const menu = page.getByRole("menu", { name: "Действия с текстом" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Вставить" })).toBeDisabled();
  await expect(
    menu.getByRole("menuitem", { name: "Копировать" }),
  ).toBeEnabled();
  await menu.getByRole("menuitem", { name: "Жирный" }).click();
  await expect(
    page.locator(".screenplay-editor strong").filter({ hasText: "миску" }),
  ).toBeVisible();
  await page.locator(".screenplay-editor p").last().click();
  await page.locator(".screenplay-editor p").last().click({ button: "right" });
  await expect(
    menu.getByRole("menuitem", { name: "Копировать" }),
  ).toBeDisabled();
  await expect(menu.getByRole("menuitem", { name: "Вырезать" })).toBeDisabled();
});
test("context menu suggests Russian corrections and stays in the viewport", async ({
  page,
}) => {
  await page.goto("/app");
  await select(page, "Кошкка");
  await page.locator(".screenplay-editor p").last().click({ button: "right" });
  const menu = page.getByRole("menu", { name: "Действия с текстом" });
  await expect(
    menu.getByRole("menuitem", { name: "кошка", exact: true }),
  ).toBeVisible();
  const box = await menu.boundingBox();
  expect(box.y + box.height).toBeLessThanOrEqual(1000);
  await menu.getByRole("menuitem", { name: "кошка", exact: true }).click();
  await expect(page.locator(".screenplay-editor")).toContainText("Кошка");
});
test("PDF and DOCX include metadata and poster on a separate cover; FDX keeps title text out of script", async ({
  page,
}, info) => {
  await page.goto("/app");
  const result = await page.evaluate(async (doc) => {
    const exports = await import("/src/exports.js");
    const canvas = document.createElement("canvas");
    canvas.width = 120;
    canvas.height = 180;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#5141e9";
    ctx.fillRect(0, 0, 120, 180);
    doc.metadata = {
      author: "Сергей Бухарев",
      email: "mrbuha@ya.ru",
      year: "2026",
      poster: canvas.toDataURL("image/jpeg"),
    };
    const pdfBlob = await exports.exportPDF(doc),
      docxBlob = await exports.exportDOCX(doc);
    const toBase64 = async (blob) => {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let value = "";
      for (let i = 0; i < bytes.length; i += 8192)
        value += String.fromCharCode(...bytes.subarray(i, i + 8192));
      return btoa(value);
    };
    const pdfjs = await import("/node_modules/.vite/deps/pdfjs-dist.js");
    pdfjs.GlobalWorkerOptions.workerSrc =
      "/node_modules/pdfjs-dist/build/pdf.worker.min.mjs";
    const pdf = await pdfjs.getDocument({
      data: new Uint8Array(await pdfBlob.arrayBuffer()),
    }).promise;
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++)
      pages.push(
        (await (await pdf.getPage(i)).getTextContent()).items
          .map((item) => item.str)
          .join(" "),
      );
    const cover = await pdf.getPage(1),
      viewport = cover.getViewport({ scale: 1 });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await cover.render({ canvasContext: ctx, viewport }).promise;
    return {
      pages,
      pdf: await toBase64(pdfBlob),
      docx: await toBase64(docxBlob),
      fdx: await exports.exportFDX(doc).text(),
      preview: canvas.toDataURL("image/png"),
    };
  }, structuredClone(fixture));
  expect(result.pages).toHaveLength(2);
  expect(result.pages[0]).toContain("Сергей Бухарев");
  expect(result.pages[0]).toContain("mrbuha@ya.ru");
  expect(result.pages[1].replace(/\s+/g, " ")).toContain("ИНТ. ДОМ");
  expect(result.pages[0]).not.toContain("ИНТ. ДОМ");
  const archive = unzipSync(Buffer.from(result.docx, "base64"));
  expect(
    Object.keys(archive).some(
      (name) => name.startsWith("word/media/") && /\.(jpg|jpeg)$/.test(name),
    ),
  ).toBeTruthy();
  expect(strFromU8(archive["word/document.xml"])).toContain("Сергей Бухарев");
  expect(result.fdx).toContain("<TitlePage>");
  const { writeFile } = await import("node:fs/promises");
  await writeFile(
    info.outputPath("cover.pdf"),
    Buffer.from(result.pdf, "base64"),
  );
  await writeFile(
    info.outputPath("cover.docx"),
    Buffer.from(result.docx, "base64"),
  );
  await writeFile(
    info.outputPath("cover.png"),
    Buffer.from(result.preview.split(",")[1], "base64"),
  );
});

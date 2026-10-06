import { test, expect } from "@playwright/test";
import { unzipSync, strFromU8 } from "fflate";
import { createProject } from "../src/data.js";
import { grantPro } from "./helpers/pro-access.js";

const paragraph = (format, text, blockId) => ({
  type: "paragraph",
  attrs: { format, blockId },
  content: [{ type: "text", text }],
});
function fixture() {
  const project = createProject("Шрифты и интервалы");
  project.content.content = [
    paragraph("scene", "ИНТ. ДОМ — ДЕНЬ", "scene-action"),
    paragraph("action", "Героиня стоит у окна.", "action"),
    paragraph("scene", "ИНТ. КОМНАТА — ДЕНЬ", "scene-scene"),
    paragraph("scene", "ИНТ. КУХНЯ — ДЕНЬ", "scene-plain"),
    paragraph("plain", "Обычный текст.", "plain"),
    paragraph("scene", "ЭКС. УЛИЦА — НОЧЬ", "scene-last"),
  ];
  return project;
}
async function open(page, project) {
  await grantPro(page);
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404, body: "Unavailable in this isolated test" }),
  );
  await page.addInitScript((project) => {
    if (sessionStorage.getItem("fonts-spacing-seeded")) return;
    localStorage.setItem("tyter.projects.v1", JSON.stringify([project]));
    localStorage.setItem("tyter.active", project.id);
    localStorage.setItem("tyter.language.v1", "ru");
    sessionStorage.setItem("fonts-spacing-seeded", "true");
  }, project);
  await page.goto("/free");
  await expect(page.locator(".screenplay-editor")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}
const gapAfter = (page, id) =>
  page
    .locator(`[data-block-id="${id}"]`)
    .evaluate(
      (element) =>
        element.nextElementSibling.getBoundingClientRect().top -
        element.getBoundingClientRect().bottom,
    );
const storedFont = (page) =>
  page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("tyter.projects.v1"))[0].metadata
        .fontFamily,
  );

test("only a scene followed by action gets a 10px gap, including live format changes and zoom", async ({
  page,
}) => {
  await open(page, fixture());
  await expect.poll(() => gapAfter(page, "scene-action")).toBeCloseTo(10, 1);
  await expect.poll(() => gapAfter(page, "scene-scene")).toBeCloseTo(20, 1);
  await expect.poll(() => gapAfter(page, "scene-plain")).toBeCloseTo(20, 1);
  const action = page.locator('[data-block-id="action"]');
  await action.click();
  await page.keyboard.press("Control+1");
  await expect(action).toHaveAttribute("data-format", "scene");
  await expect.poll(() => gapAfter(page, "scene-action")).toBeCloseTo(20, 1);
  await page.keyboard.press("Control+2");
  await expect(action).toHaveAttribute("data-format", "action");
  await expect.poll(() => gapAfter(page, "scene-action")).toBeCloseTo(10, 1);
  await page
    .getByRole("button", { name: "Настройки документа", exact: true })
    .click();
  await page
    .getByRole("slider", { name: "Масштаб документа", exact: true })
    .fill("200");
  await expect.poll(() => gapAfter(page, "scene-action")).toBeCloseTo(20, 1);
  await expect.poll(() => gapAfter(page, "scene-scene")).toBeCloseTo(40, 1);
});

test("Courier New persists in both languages; ENG-only Courier Prime resets to Courier in RU even with settings closed", async ({
  page,
}) => {
  await open(page, fixture());
  await page
    .getByRole("button", { name: "Настройки документа", exact: true })
    .click();
  const font = page.locator(".settings-drawer select[aria-label]");
  await expect(font.locator('option[value="courier-prime"]')).toHaveCount(0);
  await font.selectOption("courier-new");
  await expect(page.locator(".screenplay-editor")).toHaveCSS(
    "font-family",
    /Tyter Courier New/,
  );
  await page.getByRole("button", { name: "ENG", exact: true }).click();
  await expect(font).toHaveValue("courier-new");
  await expect(font.locator('option[value="courier-prime"]')).toHaveCount(1);
  await font.selectOption("courier-prime");
  await expect(page.locator(".screenplay-editor")).toHaveCSS(
    "font-family",
    /Tyter Courier Prime/,
  );
  const fonts = await page.evaluate(async () => {
    const result = [];
    const spaces = [];
    const context = document.createElement("canvas").getContext("2d");
    for (const family of ["Tyter Courier New", "Tyter Courier Prime"])
      for (const style of ["400", "700", "italic 400", "italic 700"]) {
        context.font = `${style} 16px "${family}"`;
        result.push(
          (await document.fonts.load(`${style} 16px "${family}"`, "Scene")).map(
            (face) => face.status,
          ),
        );
        spaces.push(
          context.measureText("a b").width - context.measureText("ab").width,
        );
      }
    return { faces: result, spaces };
  });
  expect(fonts.faces).toEqual(Array.from({ length: 8 }, () => ["loaded"]));
  for (const space of fonts.spaces) expect(space).toBeGreaterThan(5);
  await page
    .getByRole("button", { name: "Close settings", exact: true })
    .click();
  await page.getByRole("button", { name: "RU", exact: true }).click();
  await expect(page.locator(".screenplay-editor")).toHaveCSS(
    "font-family",
    /^"Screenplay Courier Cyrillic"/,
  );
  await expect.poll(() => storedFont(page)).toBe("courier");
  await page
    .getByRole("button", { name: "Настройки документа", exact: true })
    .click();
  await expect(font).toHaveValue("courier");
  await expect(font.locator('option[value="courier-prime"]')).toHaveCount(0);
  await font.selectOption("courier-new");
  await expect.poll(() => storedFont(page)).toBe("courier-new");
  await page.reload();
  await expect(page.locator(".screenplay-editor")).toHaveCSS(
    "font-family",
    /Tyter Courier New/,
  );
  await page.getByRole("button", { name: "ENG", exact: true }).click();
  await expect(page.locator(".screenplay-editor")).toHaveCSS(
    "font-family",
    /Tyter Courier New/,
  );
});

test("TYT retains new fonts while PDF and DOCX export Courier and conditional scene spacing", async ({
  page,
}) => {
  await open(page, fixture());
  const result = await page.evaluate(async (project) => {
    const { exportPDF, exportDOCX } = await import("/src/exports.js");
    const { readTYT, tytPayload } = await import("/src/tyt-format.js");
    const pdfjs = await import("/node_modules/.vite/deps/pdfjs-dist.js");
    pdfjs.GlobalWorkerOptions.workerSrc =
      "/node_modules/pdfjs-dist/build/pdf.worker.min.mjs";
    const fonts = ["courier-new", "courier-prime"].map(
      (fontFamily) =>
        readTYT(
          JSON.stringify(
            tytPayload({
              ...project,
              metadata: { ...project.metadata, fontFamily },
            }),
          ),
        ).metadata.fontFamily,
    );
    const positions = async (fontFamily, format) => {
      const document = {
        ...project,
        metadata: { fontFamily, fontSize: 12 },
        content: {
          type: "doc",
          content: [
            project.content.content[0],
            { ...project.content.content[1], attrs: { format } },
          ],
        },
      };
      const task = pdfjs.getDocument({
        data: new Uint8Array(await (await exportPDF(document)).arrayBuffer()),
        isEvalSupported: false,
      });
      const pdf = await task.promise;
      const page = await pdf.getPage(1);
      const text = await page.getTextContent();
      const result = text.items
        .filter((item) => item.height > 9 && item.str.trim())
        .map((item) => ({
          text: item.str,
          y: item.transform[5],
          width: item.width,
        }));
      await task.destroy();
      return result;
    };
    return {
      fonts,
      action: await positions("courier", "action"),
      plain: await positions("courier", "plain"),
      prime: await positions("courier-prime", "action"),
      courierNew: await positions("courier-new", "action"),
      docx: Array.from(
        new Uint8Array(
          await (
            await exportDOCX({
              ...project,
              metadata: { ...project.metadata, fontFamily: "courier-prime" },
            })
          ).arrayBuffer(),
        ),
      ),
    };
  }, fixture());
  expect(result.fonts).toEqual(["courier-new", "courier-prime"]);
  expect(result.prime).toEqual(result.action);
  expect(result.courierNew).toEqual(result.action);
  expect(result.action.at(-1).y - result.plain.at(-1).y).toBeCloseTo(7.5, 3);
  const xml = strFromU8(
    unzipSync(new Uint8Array(result.docx))["word/document.xml"],
  );
  const spacing = await page.evaluate((xml) => {
    const dom = new DOMParser().parseFromString(xml, "application/xml");
    const namespace =
      "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    return [...dom.getElementsByTagNameNS(namespace, "p")]
      .filter(
        (node) =>
          node
            .getElementsByTagNameNS(namespace, "pStyle")[0]
            ?.getAttributeNS(namespace, "val") === "scene",
      )
      .map((node) =>
        node
          .getElementsByTagNameNS(namespace, "spacing")[0]
          .getAttributeNS(namespace, "after"),
      );
  }, xml);
  expect(spacing).toEqual(["150", "300", "300", "300"]);
  expect(xml).toContain("Courier New");
  expect(xml).not.toContain("Courier Prime");
});

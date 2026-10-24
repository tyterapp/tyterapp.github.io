import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";
import { createProject, validateImport } from "../src/data.js";
import { ensurePageColors, setPageColor } from "../src/page-colors.js";
import { grantPro } from "./helpers/pro-access.js";

const block = (format, text, blockId, sceneVariant) => ({
  type: "paragraph",
  attrs: { format, blockId, sceneVariant: sceneVariant || null },
  content: [{ type: "text", text }],
});
function fixture() {
  const doc = createProject("Настройки экспорта");
  doc.id = "export-options";
  doc.content.content = [
    block("scene", "ИНТ. ДОМ — ДЕНЬ", "scene-1"),
    block("action", "Кошка смотрит в окно.", "action-1"),
    block("scene", "ЭКС. САД — НОЧЬ", "scene-2", "F"),
    block("action", "Друзья встречаются в саду.", "action-2"),
  ];
  return doc;
}
async function open(page, { theme = "light", mobile = false } = {}) {
  await grantPro(page);
  if (mobile) await page.setViewportSize({ width: 320, height: 600 });
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  await page.addInitScript(
    ({ doc, theme }) => {
      if (sessionStorage.getItem("export-options-seeded")) return;
      sessionStorage.setItem("export-options-seeded", "yes");
      localStorage.setItem("tyter.projects.v1", JSON.stringify([doc]));
      localStorage.setItem("tyter.active", doc.id);
      localStorage.setItem("tyter.language.v1", "ru");
      localStorage.setItem(
        "tyter.editor-preferences.v1",
        JSON.stringify({ theme }),
      );
    },
    { doc: fixture(), theme },
  );
  await page.goto("/beta");
  await expect(page.locator(".screenplay-editor")).toBeVisible();
}
async function exportMenu(page, mobile = false) {
  if (mobile)
    await page
      .getByRole("button", { name: "Открыть инструменты", exact: true })
      .click();
  await page
    .getByRole("button", { name: "Скачать сценарий", exact: true })
    .click();
  await expect(page.locator(".rail-export-menu")).toBeVisible();
  return page.locator(".rail-export-menu");
}
async function download(page, format, mobile = false) {
  const menu = await exportMenu(page, mobile);
  const downloading = page.waitForEvent("download");
  await menu
    .locator(".export-item")
    .filter({ hasText: `.${format}` })
    .click();
  const file = await downloading;
  return Buffer.from(await readFile(await file.path()));
}

test("legacy export defaults stay enabled and explicit choices survive import and page color changes", () => {
  const legacy = fixture();
  delete legacy.settings.exportSceneNumbers;
  delete legacy.settings.exportSceneVariants;
  let doc = validateImport(legacy);
  expect(doc.settings.exportSceneNumbers).toBe(true);
  expect(doc.settings.exportSceneVariants).toBe(true);
  doc = ensurePageColors(doc);
  const pageId = doc.pageVersions.pages[0].id;
  doc = setPageColor(doc, pageId, "blue");
  doc.settings = {
    ...doc.settings,
    exportSceneNumbers: false,
    exportSceneVariants: false,
  };
  doc = setPageColor(
    validateImport(JSON.parse(JSON.stringify(doc))),
    pageId,
    "white",
  );
  expect(doc.settings.exportSceneNumbers).toBe(false);
  expect(doc.settings.exportSceneVariants).toBe(false);
  doc = setPageColor(doc, pageId, "blue");
  expect(doc.settings.exportSceneNumbers).toBe(false);
  expect(doc.settings.exportSceneVariants).toBe(false);
});

for (const mobile of [false, true]) {
  test(`${mobile ? "320px dark" : "desktop light"}: export switches persist, synchronize with document settings, and switch language`, async ({
    page,
  }, info) => {
    await open(page, { mobile, theme: mobile ? "dark" : "light" });
    const menu = await exportMenu(page, mobile);
    await expect(
      menu.getByText("HTML презентация", { exact: true }),
    ).toBeVisible();
    const numbers = menu.getByRole("switch", {
      name: "Нумерация сцен",
      exact: true,
    });
    const variants = menu.getByRole("switch", {
      name: "Варианты сцен",
      exact: true,
    });
    await expect(numbers).toBeChecked();
    await expect(variants).toBeChecked();
    await numbers.uncheck();
    await expect(variants).toBeChecked();
    await variants.uncheck();
    const bounds = await menu.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(mobile ? 320 : 1440);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(mobile ? 600 : 1000);
    await menu.screenshot({ path: info.outputPath("export-switches.png") });
    await page.keyboard.press("Escape");
    if (mobile) await page.keyboard.press("Escape");
    const saved = JSON.parse(
      (await download(page, "tyt", mobile)).toString(),
    ).document;
    expect(saved.settings.exportSceneNumbers).toBe(false);
    expect(saved.settings.exportSceneVariants).toBe(false);
    expect(saved.content.content).toEqual(fixture().content.content);
    await page.reload();
    await expect(page.locator(".screenplay-editor")).toBeVisible();
    if (mobile)
      await page
        .getByRole("button", { name: "Открыть инструменты", exact: true })
        .click();
    await page
      .getByRole("button", { name: "Настройки документа", exact: true })
      .click();
    const settings = page.locator(".settings-drawer");
    await expect(
      settings.getByRole("switch", { name: "Нумерация сцен", exact: true }),
    ).not.toBeChecked();
    await expect(
      settings.getByRole("switch", { name: "Варианты сцен", exact: true }),
    ).not.toBeChecked();
    await settings
      .getByRole("switch", { name: "Нумерация сцен", exact: true })
      .check();
    await page
      .getByRole("button", { name: "Закрыть настройки", exact: true })
      .click();
    await page.getByRole("button", { name: "ENG", exact: true }).click();
    if (mobile)
      await page
        .getByRole("button", { name: "Open tools", exact: true })
        .click();
    await page
      .getByRole("button", { name: "Download screenplay", exact: true })
      .click();
    await expect(
      menu.getByText("HTML presentation", { exact: true }),
    ).toBeVisible();
    await expect(
      menu.getByRole("switch", { name: "Scene numbers", exact: true }),
    ).toBeChecked();
    await expect(
      menu.getByRole("switch", { name: "Scene variants", exact: true }),
    ).not.toBeChecked();
  });
}

test("PDF, Word and Final Draft downloads honor all four independent scene label choices", async ({
  page,
}, info) => {
  test.setTimeout(60000);
  await open(page);
  for (const filename of ["pdf.mjs", "pdf.worker.mjs"]) {
    await page.route(
      `**/node_modules/pdfjs-dist/build/${filename}`,
      async (route) =>
        route.fulfill({
          contentType: "text/javascript",
          body: await readFile(
            new URL(
              `../node_modules/pdfjs-dist/build/${filename}`,
              import.meta.url,
            ),
            "utf8",
          ),
        }),
    );
  }
  for (const [numbers, variants, labels] of [
    [true, true, ["1 A", "2 F"]],
    [false, true, ["A", "F"]],
    [true, false, ["1", "2"]],
    [false, false, []],
  ]) {
    const menu = await exportMenu(page);
    await menu
      .getByRole("switch", { name: "Нумерация сцен", exact: true })
      .setChecked(numbers);
    await menu
      .getByRole("switch", { name: "Варианты сцен", exact: true })
      .setChecked(variants);
    await page.keyboard.press("Escape");
    const pdfBytes = await download(page, "pdf");
    const pdf = await page.evaluate(async (bytes) => {
      const pdfjs = await import("/node_modules/pdfjs-dist/build/pdf.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc =
        "/node_modules/pdfjs-dist/build/pdf.worker.mjs";
      const task = pdfjs.getDocument({
        data: new Uint8Array(bytes),
        isEvalSupported: false,
      });
      const pdf = await task.promise;
      const items = (
        await (await pdf.getPage(1)).getTextContent()
      ).items.filter((item) => item.str?.trim());
      const headingX = items.find((item) => item.str.includes("ИНТ. ДОМ"))
        .transform[4];
      const labels = new Map();
      for (const item of items.filter(
        (item) =>
          item.height === 9 &&
          item.transform[4] < headingX - 10 &&
          item.transform[5] < 740,
      )) {
        const y = item.transform[5];
        labels.set(y, [...(labels.get(y) || []), item.str]);
      }
      const result = {
        labels: [...labels.values()].map((items) => items.join(" ")),
        text: items.map((item) => item.str).join(" "),
        pages: pdf.numPages,
        headingX,
      };
      await task.destroy();
      return result;
    }, Array.from(pdfBytes));
    expect(pdf.labels).toEqual(labels);
    expect(pdf.pages).toBe(1);
    expect(pdf.text).toContain("Кошка смотрит в окно.");
    expect(pdf.text).toContain("Друзья встречаются в саду.");
    await writeFile(
      info.outputPath(`labels-${numbers}-${variants}.pdf`),
      pdfBytes,
    );

    const docx = unzipSync(await download(page, "docx"));
    const word = await page.evaluate((xml) => {
      const doc = new DOMParser().parseFromString(xml, "application/xml");
      const ns = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
      const scenes = [...doc.getElementsByTagNameNS(ns, "p")].filter(
        (p) =>
          p
            .getElementsByTagNameNS(ns, "pStyle")[0]
            ?.getAttributeNS(ns, "val") === "scene",
      );
      return {
        labels: scenes.flatMap((p) =>
          [...p.getElementsByTagNameNS(ns, "r")]
            .filter(
              (r) =>
                r
                  .getElementsByTagNameNS(ns, "sz")[0]
                  ?.getAttributeNS(ns, "val") === "18",
            )
            .map((r) => r.textContent),
        ),
        hanging: scenes.map((p) =>
          p.getElementsByTagNameNS(ns, "ind")[0]?.getAttributeNS(ns, "hanging"),
        ),
        text: doc.documentElement.textContent,
      };
    }, strFromU8(docx["word/document.xml"]));
    expect(word.labels).toEqual(labels);
    expect(word.hanging).toEqual(labels.length ? ["720", "720"] : [null, null]);
    expect(word.text).toContain("Кошка смотрит в окно.");
    const fdx = await page.evaluate(
      (xml) => {
        const doc = new DOMParser().parseFromString(xml, "application/xml");
        return {
          labels: [
            ...doc.querySelectorAll(
              'Content > Paragraph[Type="Scene Heading"]',
            ),
          ]
            .map((p) => p.getAttribute("Number"))
            .filter(Boolean),
          text: doc.documentElement.textContent,
          errors: doc.querySelectorAll("parsererror").length,
        };
      },
      (await download(page, "fdx")).toString(),
    );
    expect(fdx.errors).toBe(0);
    expect(fdx.labels).toEqual(labels);
    expect(fdx.text).toContain("ИНТ. ДОМ — ДЕНЬ");
    expect(fdx.text).toContain("Друзья встречаются в саду.");
  }
});

import { test, expect } from "@playwright/test";
import { createProject, validateImport } from "../src/data.js";
import { cleanComponentAliases } from "../src/component-names.js";
import {
  libraryFromDocument,
  mergeComponentLibrary,
} from "../src/component-library.js";
import { switchScriptVersion } from "../src/script-versions.js";
import { grantPro } from "./helpers/pro-access.js";

const paragraph = (format, text, blockId) => ({
  type: "paragraph",
  attrs: { format, blockId },
  ...(text ? { content: [{ type: "text", text }] } : {}),
});
const line = (page, id) =>
  page.locator(`.screenplay-editor [data-block-id="${id}"]`);
const popup = (page) =>
  page.getByRole("listbox", { name: "Подсказки", exact: true });
const stored = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("tyter.local-files.v1", 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const database = open.result;
          const request = database
            .transaction("files")
            .objectStore("files")
            .get("documents");
          request.onsuccess = () => {
            resolve(request.result?.[0]);
            database.close();
          };
          request.onerror = () => {
            reject(request.error);
            database.close();
          };
        };
      }),
  );
const editorJSON = (page) =>
  page.locator(".screenplay-editor").evaluate((node) => node.editor.getJSON());

test("aliases are cleaned once, survive validation, libraries and inactive screenplay copies", () => {
  expect(
    cleanComponentAliases(" Джеффу, Джеффа\nджеффа;Джефф ", "Джефф"),
  ).toEqual(["Джеффу", "Джеффа"]);
  expect(cleanComponentAliases([null, 15, {}, "", "Джефф\u0000у"])).toEqual([
    "Джефф у",
  ]);
  expect(
    cleanComponentAliases(Array.from({ length: 150 }, (_, i) => `Имя ${i}`)),
  ).toHaveLength(100);
  expect(cleanComponentAliases(["x".repeat(201)])[0]).toHaveLength(200);
  let doc = createProject("Алиасы");
  doc.components = [
    {
      id: "jeff",
      name: "Джефф",
      type: "character",
      aliases: ["Джеффу", "Джеффа", "джеффа", "Джефф"],
    },
  ];
  const validated = validateImport(doc);
  expect(validated.components[0].aliases).toEqual(["Джеффу", "Джеффа"]);
  const library = libraryFromDocument(validated);
  const merged = mergeComponentLibrary(
    createProject("Другой сценарий"),
    library,
    ["jeff"],
  );
  expect(merged.document.components[0].aliases).toEqual(["Джеффу", "Джеффа"]);
  doc = switchScriptVersion(validated, "blue");
  doc.components[0] = { ...doc.components[0], aliases: ["Джеффом"] };
  const imported = validateImport(JSON.stringify(doc));
  expect(imported.components[0].aliases).toEqual(["Джеффом"]);
  expect(imported.scriptVersions.white.components[0].aliases).toEqual([
    "Джеффу",
    "Джеффа",
  ]);
});

async function open(page, { theme = "light", width = 1440 } = {}) {
  await grantPro(page);
  await page.setViewportSize({ width, height: width < 832 ? 844 : 1000 });
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  const thumbnail = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const context = canvas.getContext("2d");
    context.fillStyle = "#85b9ef";
    context.fillRect(0, 0, 64, 64);
    context.fillStyle = "#f4bd58";
    context.fillRect(8, 8, 32, 32);
    return canvas.toDataURL("image/png");
  });
  const doc = createProject("Алиасы и портреты");
  doc.id = "aliases-thumbnails";
  doc.components = [
    {
      id: "jeff",
      name: "Джефф",
      type: "character",
      description: "Главный герой",
      thumbnail,
      color: "#738598",
    },
    {
      id: "mary",
      name: "Мэри",
      type: "character",
      description: "Персонаж без портрета",
      color: "#8a799a",
    },
    {
      id: "jeffrey",
      name: "Джеффри",
      type: "character",
      description: "",
      color: "#a57878",
    },
  ];
  doc.content.content = [
    paragraph("scene", "ИНТ. КОМНАТА — ДЕНЬ", "scene"),
    {
      type: "paragraph",
      attrs: { format: "action", blockId: "mentions" },
      content: [
        { type: "text", text: "Джефф, Джеффу, " },
        { type: "text", text: "Дже", marks: [{ type: "bold" }] },
        { type: "text", text: "ффа", marks: [{ type: "italic" }] },
        { type: "text", text: ". Джеффри, Джеффа2." },
      ],
    },
    {
      type: "paragraph",
      attrs: { format: "character", blockId: "name" },
      content: [
        { type: "text", text: "ДЖЕ", marks: [{ type: "bold" }] },
        { type: "text", text: "ФФ", marks: [{ type: "italic" }] },
      ],
    },
    paragraph("speech", "Джеффу передали письмо.", "speech"),
    paragraph("character", "МЭРИ", "no-photo"),
    paragraph("speech", "Я знаю.", "reply"),
    paragraph("character", "Доктор Джефф / Джеффа", "prefixed"),
    paragraph("action", "Джеффа", "format"),
    paragraph("action", "", "typing"),
  ];
  doc.sceneVariants = {
    scene: {
      F: [
        {
          ...paragraph("scene", "ИНТ. КОМНАТА — НОЧЬ", "scene"),
          attrs: { format: "scene", blockId: "scene", sceneVariant: "F" },
        },
        paragraph("character", "ДЖЕФФА", "alias-variant"),
      ],
    },
  };
  await page.addInitScript(
    ({ doc, theme }) => {
      if (sessionStorage.getItem("aliases-portraits-seeded")) return;
      sessionStorage.setItem("aliases-portraits-seeded", "yes");
      localStorage.setItem("tyter.projects.v1", JSON.stringify([doc]));
      localStorage.setItem("tyter.active", doc.id);
      localStorage.setItem("tyter.language.v1", "ru");
      localStorage.setItem("tyter.onboarding.v1", "done");
      localStorage.setItem(
        "tyter.editor-preferences.v1",
        JSON.stringify({ theme }),
      );
    },
    { doc, theme },
  );
  await page.goto("/pro");
  await expect(line(page, "name")).toBeVisible();
}

async function componentEditor(page, mobile = false) {
  if (mobile)
    await page
      .getByRole("button", { name: "Открыть инструменты", exact: true })
      .click();
  await page.getByRole("button", { name: "Компоненты", exact: true }).click();
  const panel = page.getByRole("complementary", {
    name: "Компоненты сценария",
    exact: true,
  });
  await panel.locator('[data-component-id="jeff"] .component-item').click();
  await expect(panel.getByLabel("Алиасы", { exact: true })).toBeVisible();
  return panel;
}

for (const theme of ["light", "dark"])
  test(`${theme}: aliases colour whole mentions and portraits work in Ctrl+3 rows and suggestions without changing screenplay text`, async ({
    page,
  }, info) => {
    await open(page, { theme });
    const portrait = line(page, "name").locator(".character-thumbnail");
    await expect(portrait).toHaveCount(1);
    await expect(portrait).toHaveCSS("width", "18px");
    await expect(portrait).toHaveCSS("height", "18px");
    await expect(portrait).toHaveCSS("border-radius", "4px");
    for (const target of [
      portrait,
      line(page, "name").locator('[data-entity-id="jeff"]').last(),
      line(page, "mentions").locator('[data-entity-id="jeff"]').first(),
    ]) {
      await target.hover();
      await page.waitForTimeout(300);
      await expect(page.locator(".thumbnail-preview")).toHaveCount(0);
    }
    await line(page, "no-photo").locator('[data-entity-id="mary"]').hover();
    await expect(page.locator(".thumbnail-preview")).toContainText(
      "Персонаж без портрета",
    );
    await expect(page.locator(".thumbnail-preview img")).toHaveCount(0);
    await page.mouse.move(1400, 80);
    await expect(page.locator(".thumbnail-preview")).toHaveCount(0);
    await expect(
      line(page, "no-photo").locator(".character-thumbnail"),
    ).toHaveCount(0);
    await expect(
      line(page, "mentions").locator(".character-thumbnail"),
    ).toHaveCount(0);
    const height = (await line(page, "format").boundingBox()).height;
    const nameHeight = (await line(page, "name").boundingBox()).height;
    const panel = await componentEditor(page);
    await panel.locator('[data-component-id="jeff"] .component-item').hover();
    await page.waitForTimeout(300);
    await expect(page.locator(".thumbnail-preview")).toHaveCount(0);
    const aliases = panel.getByLabel("Алиасы", { exact: true });
    expect(
      await aliases.evaluate((node) =>
        Boolean(
          node.compareDocumentPosition(
            node.closest("form").querySelector('input[type="file"]'),
          ) & Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      ),
    ).toBe(true);
    await aliases.fill("Джеффри");
    await expect(panel.getByRole("alert")).toContainText(
      "Алиас уже используется",
    );
    await expect(
      panel.getByRole("button", { name: "Сохранить", exact: true }),
    ).toBeDisabled();
    await aliases.fill("Джеффу, Джеффа\nджеффа\nДжефф");
    await panel
      .locator(".component-editor")
      .screenshot({ path: info.outputPath("aliases-settings.png") });
    await panel.getByRole("button", { name: "Сохранить", exact: true }).click();
    await expect
      .poll(
        async () =>
          (await stored(page)).components.find((item) => item.id === "jeff")
            .aliases,
      )
      .toEqual(["Джеффу", "Джеффа"]);
    await expect(
      line(page, "mentions").locator('[data-entity-id="jeff"]'),
    ).toHaveText(["Джефф", "Джеффу", "Дже", "ффа"]);
    await expect(
      line(page, "mentions").locator('[data-entity-id="jeffrey"]'),
    ).toHaveText("Джеффри");
    const colours = await line(page, "mentions")
      .locator('[data-entity-id="jeff"]')
      .evaluateAll((nodes) =>
        nodes.map((node) => getComputedStyle(node).color),
      );
    expect(new Set(colours).size).toBe(1);
    await panel
      .getByRole("button", { name: "Закрыть компоненты", exact: true })
      .click();
    await expect(
      line(page, "prefixed").locator(".character-thumbnail"),
    ).toHaveCount(1);
    const prefixPosition = await line(page, "prefixed").evaluate((node) => {
      const text = document
        .createTreeWalker(node, NodeFilter.SHOW_TEXT)
        .nextNode();
      const range = document.createRange();
      range.setStart(text, 0);
      range.setEnd(text, 1);
      return {
        portraitRight: node
          .querySelector(".character-thumbnail")
          .getBoundingClientRect().right,
        textLeft: range.getBoundingClientRect().left,
      };
    });
    expect(prefixPosition.portraitRight).toBeLessThanOrEqual(
      prefixPosition.textLeft - 7,
    );
    const variant = page.getByRole("combobox", {
      name: "Вариант сцены 1",
      exact: true,
    });
    await variant.click();
    await page.getByRole("option", { name: "F", exact: true }).click();
    await expect(
      line(page, "alias-variant").locator(".character-thumbnail"),
    ).toBeVisible();
    await variant.click();
    await page.getByRole("option", { name: "A", exact: true }).click();
    await line(page, "format").click();
    await page.keyboard.press("Control+3");
    await expect(line(page, "format")).toHaveAttribute(
      "data-format",
      "character",
    );
    await expect(
      line(page, "format").locator(".character-thumbnail"),
    ).toBeVisible();
    const withPortrait = (await line(page, "format").boundingBox()).height;
    await page.keyboard.press("Control+2");
    await expect(
      line(page, "format").locator(".character-thumbnail"),
    ).toHaveCount(0);
    expect((await line(page, "format").boundingBox()).height).toBeCloseTo(
      height,
      1,
    );
    await page.keyboard.press("Control+3");
    expect((await line(page, "format").boundingBox()).height).toBeCloseTo(
      withPortrait,
      1,
    );
    await page.keyboard.press("Control+2");
    await line(page, "typing").click();
    await page.keyboard.press("Control+3");
    await page.keyboard.insertText("Джеффа");
    const option = popup(page).getByRole("option", { name: /^Джеффа/ });
    await expect(option.locator(".suggestion-thumbnail")).toBeVisible();
    await expect(option.locator(".suggestion-thumbnail")).toHaveCSS(
      "width",
      "24px",
    );
    await expect(option.locator(".suggestion-thumbnail")).toHaveCSS(
      "border-radius",
      "4px",
    );
    await page.screenshot({
      path: info.outputPath("aliases-and-portraits.png"),
    });
    await page.keyboard.press("Control+Enter");
    await expect(line(page, "typing")).toHaveText("ДЖЕФФА ");
    await expect(
      line(page, "typing").locator(".character-thumbnail"),
    ).toHaveCount(1);
    expect(JSON.stringify(await editorJSON(page))).not.toContain("data:image");
    expect(
      await page
        .locator(".screenplay-editor")
        .evaluate((node) => node.editor.getHTML()),
    ).not.toContain("<img");
    await page.evaluate(() =>
      window.dispatchEvent(new Event("tyter:save-now")),
    );
    await page.reload();
    await expect(
      line(page, "typing").locator(".character-thumbnail"),
    ).toBeVisible();
    const edit = await componentEditor(page);
    await edit.getByLabel("Название", { exact: true }).fill("Джеф");
    await edit
      .getByRole("button", { name: "Удалить миниатюру", exact: true })
      .click();
    await edit.getByRole("button", { name: "Сохранить", exact: true }).click();
    await expect(
      page.locator(".screenplay-editor .character-thumbnail"),
    ).toHaveCount(0);
    await expect(line(page, "typing")).toHaveText("ДЖЕФФА ");
    await expect(line(page, "name")).toHaveText("Джеф");
    await expect(line(page, "speech")).toHaveText("Джеффу передали письмо.");
    expect((await line(page, "name").boundingBox()).height).toBeCloseTo(
      nameHeight,
      1,
    );
  });

test("320px: character thumbnails fit mobile suggestions and Ctrl+3 uses the same component image", async ({
  page,
}, info) => {
  await open(page, { theme: "dark", width: 320 });
  await expect(line(page, "name").locator(".character-thumbnail")).toHaveCSS(
    "width",
    "18px",
  );
  await expect(line(page, "name").locator(".character-thumbnail")).toHaveCSS(
    "height",
    "18px",
  );
  await expect(line(page, "name").locator(".character-thumbnail")).toHaveCSS(
    "border-radius",
    "4px",
  );
  await line(page, "typing").click();
  await page.keyboard.press("Control+3");
  await page.keyboard.insertText("Дже");
  const option = popup(page).getByRole("option", { name: /^Джефф\s/ });
  await expect(option.locator(".suggestion-thumbnail")).toBeVisible();
  const image = await option.locator(".suggestion-thumbnail").boundingBox();
  expect(image.width).toBe(24);
  expect(image.height).toBe(24);
  const rect = await popup(page).boundingBox();
  expect(rect.x).toBeGreaterThanOrEqual(0);
  expect(rect.x + rect.width).toBeLessThanOrEqual(320);
  await page.screenshot({
    path: info.outputPath("mobile-character-portraits.png"),
  });
  await page.keyboard.press("Control+Enter");
  await expect(
    line(page, "typing").locator(".character-thumbnail"),
  ).toBeVisible();
});

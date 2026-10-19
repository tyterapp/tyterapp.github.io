import { test, expect } from "@playwright/test";
import { createProject } from "../src/data.js";
import { grantPro } from "./helpers/pro-access.js";

test.setTimeout(60000);
function fixture() {
  const doc = createProject("Цветные страницы");
  doc.id = "page-colors";
  doc.components = [
    {
      id: "anna",
      name: "Anna",
      type: "character",
      quantity: 1,
      color: "#9977aa",
    },
    { id: "room", name: "Room", type: "place", quantity: 3, color: "#9977aa" },
  ];
  doc.props = [{ id: "old", name: "Old prop", quantity: 99 }];
  doc.content.content = [
    {
      type: "paragraph",
      attrs: { blockId: "scene", format: "scene" },
      content: [{ type: "text", text: "INT. ROOM — DAY" }],
    },
    ...Array.from({ length: 24 }, (_, i) => ({
      type: "paragraph",
      attrs: { blockId: `line-${i}`, format: "action" },
      content: [
        {
          type: "text",
          text:
            `${i + 1}. Anna enters the Room. ` +
            "The story keeps moving forward. ".repeat(4),
        },
      ],
    })),
  ];
  return doc;
}
async function open(
  page,
  { width = 1440, language = "ru", document = fixture() } = {},
) {
  await grantPro(page);
  await page.setViewportSize({ width, height: 1000 });
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  await page.addInitScript(
    ({ document, language }) => {
      if (!sessionStorage.getItem("colors-seeded")) {
        sessionStorage.setItem("colors-seeded", "yes");
        localStorage.setItem("tyter.projects.v1", JSON.stringify([document]));
        localStorage.setItem("tyter.active", document.id);
        localStorage.setItem("tyter.language.v1", language);
        localStorage.setItem(
          "tyter.editor-preferences.v1",
          JSON.stringify({ theme: "dark" }),
        );
      }
    },
    { document, language },
  );
  await page.goto("/pro");
  await expect(page.locator(".screenplay-editor")).toBeVisible();
  await expect(
    page.getByRole("combobox", {
      name: language === "ru" ? "Цвет страницы 1" : "Page 1 color",
      exact: true,
    }),
  ).toBeVisible();
}
const picker = (page, number = 1) =>
  page.getByRole("combobox", { name: `Цвет страницы ${number}`, exact: true });
const saved = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const request = indexedDB.open("tyter.local-files.v1", 1);
        request.onerror = () => resolve(null);
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains("files")) {
            db.close();
            resolve(null);
            return;
          }
          const read = db
            .transaction("files")
            .objectStore("files")
            .get("documents");
          read.onsuccess = () => {
            db.close();
            resolve(
              read.result?.find((doc) => doc.id === "page-colors") || null,
            );
          };
          read.onerror = () => {
            db.close();
            resolve(null);
          };
        };
      }),
  );
async function color(page, id, number = 1) {
  await picker(page, number).click();
  await page.getByRole("listbox").locator(`[data-value="${id}"]`).click();
  await expect(picker(page, number)).toHaveAttribute("data-value", id);
}

test("hover exposes all nine colors 16px outside the sheet, without stealing typing focus or creating copies", async ({
  page,
}) => {
  await open(page);
  const editor = page.locator(".screenplay-editor");
  await editor.locator('[data-block-id="line-0"]').click();
  await page.keyboard.press("End");
  await page.keyboard.type(" EDITED");
  const before = await editor.textContent();
  const count = await page.locator(".page-version-control").count();
  await picker(page).hover();
  const menu = page.getByRole("listbox");
  await expect(menu.getByRole("option")).toHaveCount(9);
  await expect(menu).not.toContainText(/Создать копию|Удалить/);
  await expect(editor).toBeFocused();
  const paper = await page.locator(".script-paper").boundingBox();
  const shape = await picker(page).locator("svg").boundingBox();
  expect(shape.x - (paper.x + paper.width)).toBeCloseTo(16, 0);
  await menu.locator('[data-value="blue"]').click();
  await expect(picker(page)).toHaveAttribute("data-value", "blue");
  expect(await editor.textContent()).toBe(before);
  expect(await page.locator(".page-version-control").count()).toBe(count);
  await color(page, "pink");
  expect(await editor.textContent()).toBe(before);
  await expect
    .poll(async () => (await saved(page))?.pageVersions?.pages[0]?.active)
    .toBe("pink");
  const doc = await saved(page);
  expect(doc.pageVersions.mode).toBe("colors");
  expect(
    doc.pageVersions.pages.every((item) => !Object.keys(item.versions).length),
  ).toBe(true);
  await page.reload();
  await expect(picker(page)).toHaveAttribute("data-value", "pink");
  await expect(editor).toContainText("EDITED");
});

test("color menu supports keyboard selection and Escape", async ({ page }) => {
  await open(page);
  await picker(page).focus();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("option", { name: "v1 White", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(picker(page)).toHaveAttribute("data-value", "blue");
  await picker(page).focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(picker(page)).toBeFocused();
});

test("color is independent on each sheet; search retains page colors and has no all-version switch", async ({
  page,
}) => {
  await open(page);
  await expect(picker(page, 2)).toBeAttached();
  await color(page, "blue");
  await color(page, "pink", 2);
  await page
    .getByRole("navigation", { name: "Инструменты редактора" })
    .getByRole("button", { name: "Поиск по сценарию", exact: true })
    .click();
  await page.getByLabel("Поиск по тексту", { exact: true }).fill("Anna");
  await expect(page.locator(".search-result-card").first()).toContainText(
    "v2 Blue",
  );
  await expect(
    page.locator(".search-result-card").filter({ hasText: "v3 Pink" }).first(),
  ).toBeAttached();
  await expect(
    page.getByRole("switch", { name: "Искать во всех версиях" }),
  ).toHaveCount(0);
});

for (const language of ["ru", "en"])
  test(`${language}: component quantity persists, relationships are absent and report action moved from props`, async ({
    page,
  }) => {
    await open(page, { language });
    const rail = page.getByRole("navigation", {
      name: language === "ru" ? "Инструменты редактора" : "Editor tools",
    });
    await rail
      .getByRole("button", {
        name: language === "ru" ? "Компоненты" : "Components",
        exact: true,
      })
      .click();
    const drawer = page.locator("aside.components-drawer");
    if (language === "ru")
      await page.screenshot({ path: ".cache/components-report-menu.png" });
    await expect(
      drawer.getByRole("button", {
        name:
          language === "ru"
            ? "Скачать отчёт реквизита"
            : "Download props report",
      }),
    ).toBeVisible();
    await drawer.locator('[data-component-id="anna"] .component-item').click();
    await expect(drawer.locator(".component-relationships")).toHaveCount(0);
    const quantity = drawer.getByRole("spinbutton", {
      name: language === "ru" ? "Количество компонента" : "Component quantity",
      exact: true,
    });
    await quantity.fill("0");
    if (language === "ru")
      await page.screenshot({ path: ".cache/component-quantity.png" });
    await drawer
      .getByRole("button", {
        name: language === "ru" ? "Сохранить" : "Save",
        exact: true,
      })
      .click();
    await expect
      .poll(
        async () =>
          (await saved(page))?.components.find(({ id }) => id === "anna")
            .quantity,
      )
      .toBe(0);
    await drawer.locator('[data-component-id="room"] .component-item').click();
    await quantity.fill("2.5");
    await drawer
      .getByRole("button", {
        name: language === "ru" ? "Сохранить" : "Save",
        exact: true,
      })
      .click();
    await expect
      .poll(
        async () =>
          (await saved(page))?.components.find(({ id }) => id === "room")
            ?.quantity,
      )
      .toBe(2.5);
    const download = page.waitForEvent("download");
    await drawer
      .getByRole("button", {
        name:
          language === "ru"
            ? "Скачать отчёт реквизита"
            : "Download props report",
      })
      .click();
    expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
    await rail
      .getByRole("button", {
        name: language === "ru" ? "Реквизит" : "Props",
        exact: true,
      })
      .click();
    await expect(
      drawer.getByRole("button", {
        name:
          language === "ru"
            ? "Скачать отчёт реквизита"
            : "Download props report",
      }),
    ).toHaveCount(0);
  });

test("320px touch layout can select colors without changing text", async ({
  page,
}) => {
  await open(page, { width: 320 });
  const before = await page.locator(".screenplay-editor").textContent();
  await color(page, "green");
  const bounds = await picker(page).boundingBox();
  expect(bounds.height).toBeGreaterThanOrEqual(44);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
  expect(await page.locator(".screenplay-editor").textContent()).toBe(before);
  await page.screenshot({ path: ".cache/page-colors-mobile.png" });
});

test("deleting all text preserves the first sheet color and undo restores the colored pages", async ({
  page,
}) => {
  await open(page);
  await color(page, "blue");
  await color(page, "pink", 2);
  const editor = page.locator(".screenplay-editor");
  const before = await editor.textContent();
  await editor.click();
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Backspace");
  await expect(page.locator(".page-version-control")).toHaveCount(1);
  await expect(picker(page)).toHaveAttribute("data-value", "blue");
  await editor.press("Control+z");
  await expect(editor).toHaveText(before);
  await expect(picker(page, 2)).toHaveAttribute("data-value", "pink");
  await expect(picker(page)).toHaveAttribute("data-value", "blue");
});

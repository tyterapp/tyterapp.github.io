import { test, expect } from "@playwright/test";
import { createCanvas } from "@napi-rs/canvas";
import { createProject } from "../src/data.js";
import { grantPro } from "./helpers/pro-access.js";
test.setTimeout(60000);
async function open(page, { theme = "light", long = false } = {}) {
  await grantPro(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  const doc = createProject("Исходный сценарий");
  doc.id = "editor-followup";
  doc.components = [
    {
      id: "anna",
      type: "character",
      name: "ANNA",
      url: "https://example.com/research",
      urlEnabled: true,
    },
  ];
  doc.content.content = Array.from({ length: long ? 6 : 3 }, (_, index) => [
    {
      type: "paragraph",
      attrs: { format: "scene", blockId: `s${index}` },
      content: [{ type: "text", text: `INT. ROOM ${index} — DAY` }],
    },
    {
      type: "paragraph",
      attrs: { format: "action", blockId: `a${index}` },
      content: [
        {
          type: "text",
          text: long
            ? "The scene continues. ".repeat(130)
            : index
              ? "The story continues."
              : "ANNA enters the room.",
        },
      ],
    },
  ]).flat();
  if (long) {
    const canvas = createCanvas(32, 18);
    canvas.getContext("2d").fillRect(0, 0, 32, 18);
    const image = canvas.toDataURL("image/png");
    doc.sceneShots = Object.fromEntries(
      Array.from({ length: 6 }, (_, index) => [
        `s${index}`,
        { A: { frames: [{ id: `f${index}`, image, durationMs: 60000 }] } },
      ]),
    );
  }
  await page.addInitScript(
    ({ doc, theme }) => {
      if (sessionStorage.getItem("followup-seed")) return;
      sessionStorage.setItem("followup-seed", "1");
      localStorage.setItem("tyter.projects.v1", JSON.stringify([doc]));
      localStorage.setItem("tyter.active", doc.id);
      localStorage.setItem("tyter.onboarding.v1", "done");
      localStorage.setItem("tyter.editor-intro.v1", "seen");
      localStorage.setItem("tyter.language.v1", "ru");
      localStorage.setItem(
        "tyter.editor-preferences.v1",
        JSON.stringify({ theme }),
      );
    },
    { doc, theme },
  );
  await page.goto("/pro");
  await expect(page.locator(".screenplay-editor")).toBeVisible();
}
const content = (page) =>
  page
    .locator(".screenplay-editor")
    .evaluate((element) => element.editor.getJSON());
const board = (page) =>
  page
    .locator(".document-view-toggle")
    .getByRole("button", { name: "Раскадровка", exact: true })
    .click();
for (const theme of ["light", "dark"])
  test(`${theme}: empty storyboard cards use the page color and scene icon and open scene settings`, async ({
    page,
  }) => {
    await open(page, { theme });
    await page
      .getByRole("combobox", { name: "Цвет страницы 1", exact: true })
      .hover();
    await page.getByRole("option", { name: "v3 Pink", exact: true }).click();
    const background = await page
      .locator(".revision-page-background")
      .first()
      .evaluate((node) => getComputedStyle(node).backgroundColor);
    await board(page);
    const first = page.locator(".story-card").first();
    await expect(first.locator(".story-image")).toHaveCSS(
      "background-color",
      background,
    );
    await expect(first.locator(".scene-format-icon")).toHaveCSS(
      "mask-image",
      /scene\.svg/,
    );
    await first.locator(".story-card-select").click();
    await expect(page.locator(".story-inspector")).toBeVisible();
    await page.screenshot({ path: `.cache/storyboard-empty-${theme}.png` });
  });

test("hover links open a new tab, Ctrl click opens settings, and removing the link retains the component", async ({
  page,
  context,
}) => {
  await open(page);
  await context.route("https://example.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "Resource" }),
  );
  const entity = page.locator('[data-entity-id="anna"]').first();
  await entity.hover();
  const link = page.getByRole("link", {
    name: "Открыть ссылку: ANNA",
    exact: true,
  });
  await expect(link).toBeVisible();
  const popupPromise = page.waitForEvent("popup");
  await link.click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  expect(popup.url()).toBe("https://example.com/research");
  await popup.close();
  await entity.hover();
  await expect(link).toBeVisible();
  await link.click({ modifiers: ["Control"] });
  const drawer = page.locator(".component-detail-drawer");
  await expect(
    drawer.getByLabel("Ссылка компонента", { exact: true }),
  ).toHaveValue("https://example.com/research");
  await drawer
    .getByRole("button", { name: "Удалить ссылку", exact: true })
    .click();
  await drawer.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(entity).toBeVisible();
  await entity.hover();
  await expect(page.locator(".component-hover-link")).toHaveCount(0);
  await expect(page.locator(".script-component-url")).toHaveCount(0);
});

test("selection toolbar attaches a URL to a new component without replacing selected text", async ({
  page,
}) => {
  await open(page);
  const before = await page.locator(".screenplay-editor").innerText();
  await page.locator(".screenplay-editor").evaluate((element) => {
    const editor = element.editor;
    editor.state.doc.descendants((node, pos) => {
      if (node.attrs.blockId === "a0")
        editor
          .chain()
          .focus()
          .setTextSelection({ from: pos + 6, to: pos + 12 })
          .run();
    });
  });
  await page
    .getByRole("toolbar", { name: "Selected text actions" })
    .getByRole("button", { name: "Добавить ссылку", exact: true })
    .click();
  await page
    .locator(".selection-link-form input")
    .fill("https://example.com/scene");
  await page
    .locator(".selection-link-form")
    .getByRole("button", { name: "Добавить", exact: true })
    .click();
  await expect(
    page
      .locator(".component-detail-drawer")
      .getByLabel("Ссылка компонента", { exact: true }),
  ).toHaveValue("https://example.com/scene");
  expect(await page.locator(".screenplay-editor").innerText()).toBe(before);
});

test("learning opens from Help and the document menu without altering the screenplay, honors reduced motion and exposes the brand menu", async ({
  page,
}) => {
  await open(page);
  const before = await content(page);
  await expect(
    page.locator('.workspace-tools button[aria-label="Реквизит"]'),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Обучение", exact: true }).click();
  const learning = page.getByRole("main", {
    name: "Документ обучения",
    exact: true,
  });
  await expect(learning).toBeVisible();
  await expect(
    learning.getByRole("heading", {
      name: "Как быстрее работать с текстом?",
      exact: true,
    }),
  ).toBeVisible();
  await expect
    .poll(() =>
      learning.evaluate((node) => node.getAnimations({ subtree: true }).length),
    )
    .toBeGreaterThan(0);
  await learning
    .getByRole("button", { name: "Вернуться к сценарию", exact: true })
    .click();
  expect(await content(page)).toEqual(before);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Документы", exact: true }).click();
  await page
    .locator(".document-menu")
    .getByRole("button", { name: /Обучение/ })
    .click();
  await expect(learning).toBeVisible();
  expect(
    await learning.evaluate(
      (node) => node.getAnimations({ subtree: true }).length,
    ),
  ).toBe(0);
  await learning
    .getByRole("button", { name: "Вернуться к сценарию", exact: true })
    .click();
  await page.locator(".brand-mark").click({ button: "right" });
  const menu = page.getByRole("menu", {
    name: "Материалы бренда",
    exact: true,
  });
  await expect(
    menu.getByRole("menuitem", { name: "Брендбук", exact: true }),
  ).toHaveAttribute("href", "/design#brandbook");
  await expect(
    menu.getByRole("menuitem", { name: "Гайдлайны", exact: true }),
  ).toHaveAttribute("href", "/design#guidelines");
  await expect(
    menu.getByRole("menuitem", { name: "UI кит", exact: true }),
  ).toHaveAttribute("href", "/design#ui-kit");
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  expect(await content(page)).toEqual(before);
});

test("player page arrows traverse all storyboard pages and a backdrop click closes it", async ({
  page,
}) => {
  await open(page, { long: true });
  await expect
    .poll(() => page.locator(".revision-page-background").count())
    .toBeGreaterThan(2);
  await board(page);
  await expect
    .poll(() => page.locator(".story-page-play").count())
    .toBeGreaterThan(1);
  const pages = await page
    .locator(".story-page-play")
    .evaluateAll((nodes) =>
      nodes.map((node) =>
        Number(node.getAttribute("aria-label").match(/\d+/)[0]),
      ),
    );
  expect(pages.length).toBeGreaterThan(1);
  await page.locator(".story-page-play").first().click();
  const player = page.locator(".story-player");
  await expect(
    player.getByRole("button", { name: "Предыдущая страница", exact: true }),
  ).toBeDisabled();
  for (const number of pages.slice(1)) {
    await player
      .getByRole("button", { name: "Следующая страница", exact: true })
      .click();
    await expect(player).toHaveAttribute(
      "aria-label",
      `Проигрыватель страницы ${number}`,
    );
  }
  await expect(
    player.getByRole("button", { name: "Следующая страница", exact: true }),
  ).toBeDisabled();
  await player
    .getByRole("button", { name: "Предыдущая страница", exact: true })
    .click();
  await expect(player).toHaveAttribute(
    "aria-label",
    `Проигрыватель страницы ${pages.at(-2)}`,
  );
  await page.mouse.click(8, 8);
  await expect(player).toHaveCount(0);
});

for (const theme of ["light", "dark"])
  test(`${theme}: design resources share the landing layout, work on mobile and provide real downloads`, async ({
    page,
  }) => {
    await page.addInitScript((theme) => {
      localStorage.setItem(
        "tyter.editor-preferences.v1",
        JSON.stringify({ theme }),
      );
      localStorage.setItem("tyter.language.v1", "ru");
    }, theme);
    await page.goto("/design");
    await expect(
      page.getByRole("heading", {
        name: "История в каждой детали",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator("#brandbook")).toBeVisible();
    await page.locator('a[href="#ui-kit"]').click();
    await expect(page.locator("#ui-kit")).toBeInViewport();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.locator('a[href="/brand/tyter-ui-tokens.css"]').click(),
    ]);
    expect(download.suggestedFilename()).toBe("tyter-ui-tokens.css");
    await page.screenshot({ path: `.cache/design-${theme}.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('a[href="#brandbook"]').click();
    await expect(page.locator("#brandbook")).toBeInViewport();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
    await page.screenshot({ path: `.cache/design-mobile-${theme}.png` });
  });

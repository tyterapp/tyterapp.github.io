import { test, expect } from "@playwright/test";
import { createProject } from "../src/data.js";
import { grantPro } from "./helpers/pro-access.js";

test.use({ serviceWorkers: "block" });
async function open(
  page,
  { theme = "light", language = "ru", mobile = false } = {},
) {
  await grantPro(page);
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  await page.setViewportSize({ width: mobile ? 390 : 1440, height: 1000 });
  const doc = createProject("Learning fixture");
  doc.id = "learning-fixture";
  doc.components = [
    { id: "lamp", name: "Lamp", type: "object", color: "#9977aa" },
    {
      id: "disabled",
      name: "Chair",
      type: "object",
      color: "#9977aa",
      enabled: false,
    },
  ];
  doc.content.content = [
    {
      type: "paragraph",
      attrs: { format: "action", blockId: "text" },
      content: [
        {
          type: "text",
          text: "Lamp",
          marks: [{ type: "entity", attrs: { id: "lamp", color: "#9977aa" } }],
        },
        { type: "text", text: " and " },
        {
          type: "text",
          text: "Chair",
          marks: [
            { type: "entity", attrs: { id: "disabled", color: "#9977aa" } },
          ],
        },
        { type: "text", text: " are here." },
      ],
    },
  ];
  await page.addInitScript(
    ({ doc, theme, language }) => {
      if (sessionStorage.getItem("learning-seeded")) return;
      sessionStorage.setItem("learning-seeded", "1");
      localStorage.setItem("tyter.projects.v1", JSON.stringify([doc]));
      localStorage.setItem("tyter.active", doc.id);
      localStorage.setItem("tyter.onboarding.v1", "done");
      localStorage.setItem("tyter.editor-intro.v1", "seen");
      localStorage.setItem("tyter.language.v1", language);
      localStorage.setItem(
        "tyter.editor-preferences.v1",
        JSON.stringify({ theme }),
      );
    },
    { doc, theme, language },
  );
  await page.goto("/pro");
  await expect(page.locator(".screenplay-editor")).toBeVisible();
}
const content = (page) =>
  page.locator(".screenplay-editor").evaluate((dom) => dom.editor.getJSON());
async function learning(page, mobile = false) {
  if (mobile)
    await page
      .getByRole("button", { name: /^(Открыть инструменты|Open tools)$/ })
      .click();
  await page.getByRole("button", { name: /^(Обучение|Help)$/ }).click();
  return page.locator(".learning-paper");
}

for (const { language, theme, mobile } of [
  { language: "ru", theme: "light", mobile: false },
  { language: "en", theme: "dark", mobile: true },
])
  test(`${language}: learning switches greeting and shortcuts without animated body text or document changes`, async ({
    page,
  }, info) => {
    await open(page, { language, theme, mobile });
    const before = await content(page);
    const paper = await learning(page, mobile);
    const greeting = paper.getByRole("tab", {
      name: language === "ru" ? "Привет!" : "Hi!",
      exact: true,
    });
    const shortcuts = paper.getByRole("tab", {
      name: language === "ru" ? "Горячие клавиши" : "Keyboard shortcuts",
      exact: true,
    });
    await expect(greeting).toHaveAttribute("aria-selected", "true");
    await expect(paper.locator("h2 .emotional-unit").first()).toBeVisible();
    await expect(paper.locator("p .emotional-unit")).toHaveCount(0);
    if (!mobile) {
      const tabs = await paper.getByRole("tablist").boundingBox();
      const back = await paper.locator(".learning-back").boundingBox();
      expect(
        Math.abs(tabs.y + tabs.height / 2 - back.y - back.height / 2),
      ).toBeLessThan(2);
    }
    await shortcuts.click();
    await expect(shortcuts).toHaveAttribute("aria-selected", "true");
    await expect(paper.locator(".shortcut-row").first()).toBeVisible();
    await expect(paper.locator(".emotional-unit")).toHaveCount(0);
    await expect(
      paper.locator("kbd").filter({ hasText: /^Ctrl \+ E$/ }),
    ).toHaveCount(0);
    await expect(
      paper.locator("kbd").filter({ hasText: "Ctrl + Alt + E" }),
    ).toBeVisible();
    const bounds = await paper.getByRole("tablist").boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(mobile ? 390 : 1440);
    await page.screenshot({ path: info.outputPath("learning-shortcuts.png") });
    await shortcuts.press("ArrowLeft");
    await expect(greeting).toBeFocused();
    await expect(greeting).toHaveAttribute("aria-selected", "true");
    await paper.locator(".learning-back").click();
    expect(await content(page)).toEqual(before);
  });

for (const theme of ["light", "dark"])
  test(`${theme}: disabling component highlights restores surrounding text color`, async ({
    page,
  }) => {
    await open(page, { theme });
    const values = () =>
      page.locator('[data-block-id="text"]').evaluate((node) => ({
        text: getComputedStyle(node).color,
        active: [...node.querySelectorAll('[data-entity-id="lamp"]')].map(
          (n) => getComputedStyle(n).color,
        ),
        disabled: [
          ...node.querySelectorAll(
            '[data-entity-id="disabled"],.script-entity-disabled',
          ),
        ].map((n) => getComputedStyle(n).color),
      }));
    const before = await content(page);
    const original = await values();
    expect(original.active.length).toBeGreaterThan(0);
    expect(original.active.every((color) => color !== original.text)).toBe(
      true,
    );
    expect(
      original.disabled.every((color) => color === original.text),
      JSON.stringify(original),
    ).toBe(true);
    await page.keyboard.press("Control+Alt+e");
    await expect(page.locator(".screenplay-editor-shell")).toHaveClass(
      /component-hints-hidden/,
    );
    const hidden = await values();
    expect(
      hidden.active.every((color) => color === hidden.text),
      JSON.stringify(hidden),
    ).toBe(true);
    expect(
      hidden.disabled.every((color) => color === hidden.text),
      JSON.stringify(hidden),
    ).toBe(true);
    await page.keyboard.press("Control+Alt+e");
    const restored = await values();
    expect(restored.active.every((color) => color !== restored.text)).toBe(
      true,
    );
    expect(await content(page)).toEqual(before);
  });

test("dark: hints disabled also clear a component nested inside a text link", async ({
  page,
}) => {
  await open(page, { theme: "dark" });
  await page.locator(".screenplay-editor").evaluate((dom) => {
    const { state, view } = dom.editor;
    view.dispatch(
      state.tr.addMark(
        1,
        5,
        state.schema.marks.link.create({ href: "https://example.test" }),
      ),
    );
  });
  await page.keyboard.press("Control+Alt+e");
  const colors = await page
    .locator('[data-block-id="text"]')
    .evaluate((node) => ({
      text: getComputedStyle(node).color,
      entity: [...node.querySelectorAll('[data-entity-id="lamp"]')].map(
        (n) => ({ color: getComputedStyle(n).color, html: n.outerHTML }),
      ),
    }));
  expect(
    colors.entity.every((n) => n.color === colors.text),
    JSON.stringify(colors),
  ).toBe(true);
});

test("selected text has no Props action or Ctrl+E handler but retains component creation and hint toggle", async ({
  page,
}) => {
  await open(page);
  const before = await content(page);
  await page
    .locator(".screenplay-editor")
    .evaluate((dom) =>
      dom.editor.chain().focus().setTextSelection({ from: 6, to: 9 }).run(),
    );
  const toolbar = page.getByRole("toolbar", { name: "Selected text actions" });
  await expect(toolbar).toBeVisible();
  await expect(
    toolbar.getByRole("button", { name: /реквизит|props/i }),
  ).toHaveCount(0);
  const consumed = await page.locator(".screenplay-editor").evaluate((dom) => {
    const event = new KeyboardEvent("keydown", {
      key: "e",
      code: "KeyE",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    dom.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(consumed).toBe(false);
  await expect(page.locator(".props-drawer")).toHaveCount(0);
  expect(await content(page)).toEqual(before);
  await page.keyboard.press("Control+d");
  await expect(
    page.getByRole("complementary", { name: "Компоненты сценария" }),
  ).toBeVisible();
});

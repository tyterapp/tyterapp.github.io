import { test, expect } from "@playwright/test";
import { createProject } from "../src/data.js";
import { telegramLink } from "../src/telegram.js";
import { grantPro } from "./helpers/pro-access.js";

test.beforeEach(async ({ context }) => {
  await context.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
});

async function composer(page) {
  await page.addInitScript(() => {
    localStorage.setItem("tyter.language.v1", "en");
    localStorage.setItem(
      "tyter.editor-preferences.v1",
      JSON.stringify({ theme: "light" }),
    );
    localStorage.removeItem("tyter.telegraph-draft.v1");
  });
  await page.goto("/tytergraph/");
  await expect(page.locator(".telegraph-document")).toBeFocused();
}
async function key(page, duration = 70) {
  await page.keyboard.down("Control");
  await page.keyboard.down("m");
  await page.clock.runFor(duration);
  await page.keyboard.up("m");
  await page.keyboard.up("Control");
  await page.clock.runFor(60);
}

test("first click draws one non-blocking shader wave per session, including after reload", async ({
  page,
}) => {
  await composer(page);
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 100));
  await page.locator(".telegraph-document").click();
  await expect(page.locator(".first-click-wave")).toHaveCount(1);
  await expect(page.locator(".first-click-wave")).toHaveCSS(
    "pointer-events",
    "none",
  );
  await page.keyboard.type("WAVE");
  await expect(page.locator(".telegraph-document")).toHaveText("WAVE");
  await page.clock.runFor(100);
  await page.screenshot({ path: ".cache/tytergraph-first-wave.png" });
  await page.clock.runFor(1200);
  await expect(page.locator(".first-click-wave")).toHaveCount(0);
  await page.locator(".telegraph-document").click();
  await expect(page.locator(".first-click-wave")).toHaveCount(0);
  await page.reload();
  await page.locator(".telegraph-document").click();
  await expect(page.locator(".first-click-wave")).toHaveCount(0);
});

for (const reducedMotion of ["reduce", "no-preference"])
  test(`${reducedMotion}: unavailable WebGL keeps Morse input usable`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) {
        return type === "webgl" ? null : original.call(this, type, ...args);
      };
    });
    await composer(page);
    await page.clock.install();
    await page.locator(".telegraph-document").click();
    await expect(page.locator(".first-click-wave")).toHaveCount(0);
    await key(page);
    await page.clock.runFor(600);
    await expect(page.locator(".telegraph-document")).toHaveText("E");
  });

test("ENG accepts unique Russian reference codes and a cancelled touch keeps the preceding valid dot", async ({
  page,
}) => {
  await composer(page);
  await page.clock.install();
  for (let i = 0; i < 4; i++) await key(page, 300);
  await page.clock.runFor(600);
  await expect(page.locator(".telegraph-document")).toHaveText("Ш");
  await key(page, 60);
  await page.locator(".telegraph-key").dispatchEvent("pointerdown", {
    button: 0,
    pointerId: 7,
    pointerType: "touch",
    isPrimary: true,
  });
  await page.clock.runFor(50);
  await page
    .locator(".telegraph-key")
    .dispatchEvent("pointercancel", { pointerId: 7 });
  await page.clock.runFor(600);
  await expect(page.locator(".telegraph-document")).toHaveText("ШE");
});

test("alphabet and share dialog omit the removed explanations and visible link label", async ({
  page,
}) => {
  await composer(page);
  await page
    .getByRole("button", { name: "Morse alphabet", exact: true })
    .click();
  await expect(page.locator(".telegraph-letter")).toHaveCount(59);
  await expect(page.locator(".telegraph-alphabet-hint")).toHaveCount(0);
  await expect(page.locator(".telegraph-alphabet-author")).toHaveAttribute(
    "href",
    "https://t.me/ultraproduct",
  );
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.locator(".telegraph-document").fill("Telegram");
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await expect(page.locator(".telegram-share-link span")).toHaveCount(0);
  await expect(page.getByLabel("Telegram link", { exact: true })).toHaveValue(
    /#telegram=/,
  );
});

test("changing language does not erase an already keyed letter", async ({
  page,
}) => {
  await composer(page);
  await page.clock.install();
  for (const duration of [60, 300, 300]) await key(page, duration);
  await page.getByRole("button", { name: "RU", exact: true }).click();
  await page.clock.runFor(600);
  await expect(page.locator(".telegraph-document")).toHaveText("W");
  for (const duration of [60, 300, 300]) await key(page, duration);
  await page.clock.runFor(600);
  await expect(page.locator(".telegraph-document")).toHaveText("WВ");
});

test("telegram reader stays light and its icon replay, signal strip and Write action are synchronized", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "tyter.editor-preferences.v1",
      JSON.stringify({ theme: "dark" }),
    ),
  );
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 100));
  const url = new URL(telegramLink("E T", "en"));
  await page.goto(url.pathname + url.hash);
  const replay = page.getByRole("button", {
    name: "Listen again",
    exact: true,
  });
  await expect(replay).toHaveText("");
  await replay.click();
  const tape = page.getByRole("progressbar", { name: "Telegram playback" });
  await expect(tape).toHaveAttribute("data-tone", "true");
  await expect(tape.locator('rect[data-active="true"]')).toHaveAttribute(
    "width",
    "7",
  );
  await page.clock.runFor(36);
  await expect(tape).toHaveAttribute("data-tone", "false");
  await expect(page.locator(".telegraph-text")).toHaveText("E");
  await page.clock.runFor(252);
  await expect(tape.locator('rect[data-active="true"]')).toHaveAttribute(
    "width",
    "22",
  );
  await expect(page.locator(".telegram-page")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  const buttonBounds = await replay.boundingBox(),
    tapeBounds = await tape.boundingBox();
  expect(tapeBounds.height).toBe(buttonBounds.height);
  expect(tapeBounds.x).toBeGreaterThan(buttonBounds.x + buttonBounds.width);
  await expect(
    page.getByRole("link", { name: "Write", exact: true }),
  ).toHaveAttribute("href", "/tytergraph/");
  await page.clock.runFor(1000);
  await expect(tape).toHaveAttribute("aria-valuenow", "3");
  await page.screenshot({ path: ".cache/telegram-reader-updated.png" });
});

test("landing moves Design and Case into the logo context menu with new-tab links", async ({
  page,
}) => {
  await page.goto("/");
  const nav = page.locator(".site-nav nav");
  await expect(nav.locator('a[href="/design"],a[href="/case"]')).toHaveCount(0);
  await page.locator(".site-logo").click({ button: "right" });
  const menu = page.getByRole("menu");
  for (const path of ["/design", "/case"]) {
    const link = menu.locator(`a[href="${path}"]`);
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("target", "_blank");
  }
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await page.locator(".site-logo").focus();
  await page.keyboard.press("Shift+F10");
  await expect(menu).toBeVisible();
});

async function editor(page, language = "en") {
  await grantPro(page);
  const doc = createProject("Component picker");
  doc.id = "picker";
  doc.components = [
    { id: "lamp", name: "Lamp", type: "object", color: "#8a799a" },
    { id: "chair", name: "Chair", type: "object", color: "#8a799a" },
    { id: "anna", name: "Anna", type: "character", color: "#8a799a" },
  ];
  doc.content.content = [
    {
      type: "paragraph",
      attrs: { format: "scene", blockId: "scene" },
      content: [{ type: "text", text: "INT. ROOM — DAY" }],
    },
    {
      type: "paragraph",
      attrs: { format: "action", blockId: "action" },
      content: [
        { type: "text", text: "Lamp with Anna and " },
        {
          type: "text",
          text: "the website",
          marks: [
            {
              type: "link",
              attrs: { href: "https://example.com/full-address" },
            },
          ],
        },
      ],
    },
    {
      type: "paragraph",
      attrs: { format: "character", blockId: "character" },
      content: [{ type: "text", text: "ANNA" }],
    },
  ];
  await page.addInitScript(
    ({ doc, language }) => {
      if (sessionStorage.getItem("picker-seeded")) return;
      sessionStorage.setItem("picker-seeded", "1");
      localStorage.setItem("tyter.projects.v1", JSON.stringify([doc]));
      localStorage.setItem("tyter.active", doc.id);
      localStorage.setItem("tyter.editor-intro.v1", "seen");
      localStorage.setItem("tyter.language.v1", language);
      localStorage.setItem(
        "tyter.editor-preferences.v1",
        JSON.stringify({ theme: "light" }),
      );
    },
    { doc, language },
  );
  await page.goto("/pro");
  await expect(
    page.locator(
      '.screenplay-editor [data-block-id="action"] [data-entity-id="lamp"]',
    ),
  ).toBeVisible();
}

test("component replacement works in action and character mentions, preserves undo and excludes character-format lines", async ({
  page,
}) => {
  await editor(page);
  const action = page.locator('.screenplay-editor [data-block-id="action"]');
  await action.locator('[data-entity-id="lamp"]').click();
  const picker = page.getByRole("listbox", { name: "Change component" });
  await expect(picker).toBeVisible();
  await picker.getByRole("option", { name: "Chair", exact: true }).click();
  await expect(action).toContainText("Chair with Anna");
  await expect(action.locator('[data-entity-id="chair"]')).toHaveText("Chair");
  await page.keyboard.press("Control+z");
  await expect(action).toContainText("Lamp with Anna");
  await action.locator('[data-entity-id="anna"]').click();
  await expect(picker).toBeVisible();
  await page.keyboard.press("Escape");
  await page
    .locator(
      '.screenplay-editor [data-block-id="character"] [data-entity-id="anna"]',
    )
    .click();
  await expect(picker).toHaveCount(0);
  await expect(
    page.locator(".word-suggestions:not(.component-picker)"),
  ).toBeVisible();
});

for (const language of ["en", "ru"])
  test(`${language}: component hint shortcut and sidebar setting stay synchronized and survive reload`, async ({
    page,
  }) => {
    await editor(page, language);
    await page.keyboard.press("Control+Alt+e");
    await expect(page.getByRole("alert")).toContainText(
      language === "en"
        ? "Component hints disabled"
        : "Подсказки компонентов выключены",
    );
    await page
      .locator(
        '.screenplay-editor [data-block-id="action"] [data-entity-id="lamp"]',
      )
      .click();
    await expect(page.locator(".component-picker")).toHaveCount(0);
    await page
      .getByRole("navigation", {
        name: language === "en" ? "Editor tools" : "Инструменты редактора",
      })
      .getByRole("button", {
        name: language === "en" ? "Components" : "Компоненты",
        exact: true,
      })
      .click();
    const toggle = page.getByRole("checkbox", {
      name: /Component hints|Подсказки компонентов/,
    });
    await expect(toggle).not.toBeChecked();
    await toggle.check();
    await expect(page.getByRole("alert")).toContainText(
      language === "en"
        ? "Component hints enabled"
        : "Подсказки компонентов включены",
    );
    await page.reload();
    await expect(page.locator(".screenplay-editor")).toBeVisible();
    await page.keyboard.press("Control+Alt+e");
    await expect(page.locator(".screenplay-editor-shell")).toHaveClass(
      /component-hints-hidden/,
    );
  });

test("linked document text keeps editing focus and only its hover icon opens the URL", async ({
  page,
  context,
}) => {
  await editor(page);
  const link = page.locator(".screenplay-editor a.script-text-link");
  const before = context.pages().length;
  await link.click();
  await link.click({ button: "middle" });
  expect(context.pages().length).toBe(before);
  await expect(page.locator(".screenplay-editor")).toBeFocused();
  await link.hover();
  const icon = page.locator(".component-hover-link");
  await expect(icon).toHaveAttribute(
    "href",
    "https://example.com/full-address",
  );
  await icon.hover();
  await expect(page.locator(".text-link-address")).toHaveText(
    "https://example.com/full-address",
  );
  await context.route("https://example.com/**", (route) =>
    route.fulfill({ body: "Test destination" }),
  );
  const opened = context.waitForEvent("page");
  await icon.click();
  const destination = await opened;
  await destination.waitForLoadState();
  expect(destination.url()).toBe("https://example.com/full-address");
  await destination.close();
});

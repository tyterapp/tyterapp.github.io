import { test, expect } from "@playwright/test";
import { createProject } from "../src/data.js";
import { grantPro } from "./helpers/pro-access.js";

test.use({ serviceWorkers: "block" });
async function open(
  page,
  { pro = false, fresh = false, mobile = false, variant = false } = {},
) {
  if (pro) await grantPro(page);
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  await page.setViewportSize({ width: mobile ? 390 : 1440, height: 1000 });
  const document = createProject("Existing screenplay");
  document.content.content = [
    {
      type: "paragraph",
      attrs: { format: "speech", blockId: "existing" },
      content: [{ type: "text", text: "Existing words" }],
    },
  ];
  if (variant) {
    document.content.content = [
      {
        type: "paragraph",
        attrs: { format: "scene", blockId: "variant-scene", sceneVariant: "B" },
        content: [{ type: "text", text: "B draft" }],
      },
    ];
    document.sceneVariants = {
      "variant-scene": {
        A: [
          {
            type: "paragraph",
            attrs: {
              format: "scene",
              blockId: "variant-scene",
              sceneVariant: "A",
            },
            content: [{ type: "text", text: "Original A" }],
          },
        ],
        B: structuredClone(document.content.content),
      },
    };
  }
  await page.addInitScript(
    ({ document, fresh }) => {
      if (sessionStorage.getItem("empty-start-seeded")) return;
      sessionStorage.setItem("empty-start-seeded", "1");
      localStorage.setItem("tyter.language.v1", "ru");
      if (fresh) localStorage.removeItem("tyter.onboarding.v1");
      else {
        localStorage.setItem("tyter.projects.v1", JSON.stringify([document]));
        localStorage.setItem("tyter.active", document.id);
        localStorage.setItem("tyter.onboarding.v1", "done");
      }
    },
    { document, fresh },
  );
  await page.goto(pro ? "/pro" : "/free");
  await expect(page.locator(".screenplay-editor")).toBeVisible();
}
async function ready(page) {
  const editor = page.locator(".screenplay-editor");
  await expect(editor).toBeFocused();
  await expect(editor.locator("p").first()).toHaveAttribute(
    "data-format",
    "scene",
  );
  await expect(page.locator(".word-suggestions")).toBeVisible();
  expect(await editor.evaluate((dom) => dom.editor.state.selection.head)).toBe(
    1,
  );
  expect(await editor.evaluate((dom) => dom.editor.state.doc.textContent)).toBe(
    "",
  );
  await expect(page.locator(".script-paper .editor-first-visit")).toHaveCount(
    0,
  );
}
for (const setup of [
  { pro: false },
  { pro: true },
  { pro: false, mobile: true },
]) {
  test(`${setup.pro ? "Pro" : "Free"}${setup.mobile ? " mobile" : ""}: first session starts immediately at an empty scene with suggestions`, async ({
    page,
  }, info) => {
    await open(page, { ...setup, fresh: true });
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await ready(page);
    await page.screenshot({ path: info.outputPath("empty-first-session.png") });
  });
}
for (const pro of [false, true]) {
  test(`${pro ? "Pro" : "Free"}: new and fully erased documents start at INT/EXT, allow format choice, and undo restores text`, async ({
    page,
  }) => {
    await open(page, { pro });
    await page.getByRole("button", { name: "Документы", exact: true }).click();
    await page
      .getByRole("button", { name: "Новый сценарий", exact: true })
      .click();
    await ready(page);
    await page.keyboard.press("Control+4");
    await expect(page.locator(".screenplay-editor p").first()).toHaveAttribute(
      "data-format",
      "speech",
    );
    await page.getByRole("button", { name: "Документы", exact: true }).click();
    await page
      .locator(".document-menu .document-item")
      .filter({ hasText: "Existing screenplay" })
      .click();
    await expect(page.locator(".screenplay-editor")).toBeFocused();
    await page.keyboard.press("Control+a");
    await page.keyboard.press("Backspace");
    await ready(page);
    await page.keyboard.press("Control+z");
    await expect(page.locator(".screenplay-editor")).toContainText(
      "Existing words",
    );
    await expect(page.locator(".screenplay-editor p").first()).toHaveAttribute(
      "data-format",
      "speech",
    );
  });
}
test("left arrow input uses OpenArrow and greeting arrow icons appear only in learning", async ({
  page,
}) => {
  await open(page);
  const editor = page.locator(".screenplay-editor");
  await editor.press("Control+a");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Control+2");
  await page.keyboard.type("<-");
  await expect(editor.locator(".script-arrow")).toHaveText("←");
  await expect(editor.locator(".script-arrow")).toHaveCSS(
    "font-family",
    /open-arrow/,
  );
  await page.getByRole("button", { name: "Обучение", exact: true }).click();
  const greeting = page.locator(".learning-paper .editor-first-visit");
  await expect(greeting.locator(".script-arrow")).toHaveCount(4);
  await expect(greeting.locator(".script-arrow").first()).toHaveCSS(
    "font-family",
    /open-arrow/,
  );
});
test("erasing variant B keeps B selected and switching through its saved blank content preserves A", async ({
  page,
}) => {
  await open(page, { pro: true, variant: true });
  const editor = page.locator(".screenplay-editor");
  await editor.press("Control+a");
  await page.keyboard.press("Backspace");
  await ready(page);
  expect(
    await editor.evaluate(
      (dom) => dom.editor.state.doc.firstChild.attrs.sceneVariant,
    ),
  ).toBe("B");
  expect(
    await editor.evaluate(
      (dom) => dom.editor.state.doc.firstChild.attrs.blockId,
    ),
  ).toBe("variant-scene");
  await editor.locator(".scene-variant-select").click();
  await page.getByRole("option", { name: "A", exact: true }).click();
  await expect(editor).toContainText("Original A");
  await editor.locator(".scene-variant-select").click();
  await page.getByRole("option", { name: "B", exact: true }).click();
  expect(
    await editor.evaluate(
      (dom) => dom.editor.state.doc.firstChild.attrs.sceneVariant,
    ),
  ).toBe("B");
  expect(await editor.evaluate((dom) => dom.editor.state.doc.textContent)).toBe(
    "",
  );
});

test("silent restoration of blank variant B preserves the requested paragraphs and format", async ({
  page,
}) => {
  await open(page, { pro: true });
  const result = await page.locator(".screenplay-editor").evaluate((dom) => {
    dom.editor
      .chain()
      .command(({ tr }) => {
        tr.setMeta("addToHistory", false);
        return true;
      })
      .setContent(
        {
          type: "doc",
          content: [
            {
              type: "paragraph",
              attrs: { format: "scene", blockId: "empty-B", sceneVariant: "B" },
            },
            {
              type: "paragraph",
              attrs: { format: "action", blockId: "empty-action" },
            },
          ],
        },
        { emitUpdate: false },
      )
      .run();
    return dom.editor.getJSON();
  });
  expect(result.content).toHaveLength(2);
  expect(result.content[0].attrs.sceneVariant).toBe("B");
  expect(result.content[1].attrs.blockId).toBe("empty-action");
});

for (const pro of [false, true]) {
  test(`${pro ? "Pro" : "Free"}: fullscreen telegraph retains the key and tape without a share action`, async ({
    page,
  }) => {
    await open(page, { pro });
    await page.locator(".focus-mode-toggle").click();
    await page.locator(".focus-telegraph-button").click();
    await expect(page.locator(".telegraph-key")).toBeVisible();
    await expect(page.locator(".telegraph-share-button")).toHaveCount(0);
  });
}

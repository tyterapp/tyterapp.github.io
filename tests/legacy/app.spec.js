import { test, expect } from "@playwright/test";

const formats = [
  ["scene", "INT / EXT", "action"],
  ["action", "Action", "action"],
  ["character", "Character", "speech"],
  ["speech", "Speech", "character"],
  ["parenthetical", "Parenthetical", "speech"],
  ["transition", "Transition", "scene"],
  ["plain", "Plain", "plain"],
];
const block = (page, id) =>
  page.locator(`.screenplay-editor p[data-block-id="${id}"]`);
const editor = (page) =>
  page.getByRole("textbox", { name: "Screenplay editor" });

// Create an ordinary DOM selection so the editor receives the browser's own
// selectionchange event, including when a paragraph contains annotated spans.
async function selectText(locator, from, to = from) {
  await locator.evaluate(
    (element, offsets) => {
      element.closest('[contenteditable="true"]').focus();
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const nodes = [];
      let textNode;
      while ((textNode = walker.nextNode())) nodes.push(textNode);
      function point(offset) {
        for (const node of nodes) {
          if (offset <= node.textContent.length) return [node, offset];
          offset -= node.textContent.length;
        }
        return nodes.length
          ? [nodes.at(-1), nodes.at(-1).textContent.length]
          : [element, 0];
      }
      const range = document.createRange();
      range.setStart(...point(offsets.from));
      range.setEnd(...point(offsets.to));
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
    },
    { from, to },
  );
  await expect(locator).toHaveClass(/is-current-block/);
}

async function savedProject(page, predicate) {
  await expect
    .poll(async () => {
      const data = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("tyter.projects.v1") || "[]"),
      );
      return data.some(predicate);
    })
    .toBe(true);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(editor(page)).toBeVisible();
});

test("initial selection stays in the opening scene through the first save", async ({
  page,
}) => {
  const scene = block(page, "wire-scene-1");
  await expect(scene).toHaveClass(/is-current-block/);
  await expect(
    page.getByRole("button", { name: "INT / EXT (Ctrl+1)", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".save-state")).toHaveText("All changes saved");
  await page
    .getByRole("button", { name: "INT / EXT (Ctrl+1)", exact: true })
    .click();
  await page.keyboard.insertText("OPENING ");
  await expect(scene).toHaveText("OPENING INT. OFFICE — DAY");
  await expect(block(page, "wire-speech-1")).not.toContainText("OPENING");
});

for (const [index, [format, label]] of formats.entries()) {
  test(`Ctrl+${index + 1} applies ${format} at the caret without moving it`, async ({
    page,
  }) => {
    const paragraph = block(page, "wire-action-1");
    const otherParagraph = block(page, "wire-action-2");
    const original = await paragraph.textContent();
    const otherOriginal = await otherParagraph.textContent();
    await selectText(paragraph, 10);
    await page.keyboard.press(`Control+${index + 1}`);
    await expect(paragraph).toHaveAttribute("data-format", format);
    await expect(
      page.getByRole("button", {
        name: `${label} (Ctrl+${index + 1})`,
        exact: true,
      }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.insertText("TEST ");
    await expect(paragraph).toHaveText(
      original.slice(0, 10) + "TEST " + original.slice(10),
    );
    await expect(otherParagraph).toHaveText(otherOriginal);
    await expect(otherParagraph).toHaveAttribute("data-format", "action");
  });
}

test("format toolbar preserves the active paragraph and caret for every format", async ({
  page,
}) => {
  const paragraph = block(page, "wire-action-2");
  const original = await paragraph.textContent();
  await selectText(paragraph, 12);
  for (const [index, [format, label]] of formats.entries()) {
    const button = page.getByRole("button", {
      name: `${label} (Ctrl+${index + 1})`,
      exact: true,
    });
    await button.click();
    await expect(paragraph).toHaveAttribute("data-format", format);
    await expect(button).toHaveAttribute("aria-pressed", "true");
  }
  await page.keyboard.insertText("INSERTED ");
  await expect(paragraph).toHaveText(
    original.slice(0, 12) + "INSERTED " + original.slice(12),
  );
  await expect(block(page, "wire-action-1")).toHaveAttribute(
    "data-format",
    "action",
  );
});

for (const [index, [format, , nextFormat]] of formats.entries()) {
  test(`Enter after ${format} continues as ${nextFormat}`, async ({ page }) => {
    const paragraph = block(page, "wire-speech-1");
    const original = await paragraph.textContent();
    await selectText(paragraph, original.length);
    await page.keyboard.press(`Control+${index + 1}`);
    await page.keyboard.press("Enter");
    await page.keyboard.insertText("The next beat.");
    const next = editor(page).locator("p").last();
    await expect(paragraph).toHaveText(original);
    await expect(paragraph).toHaveAttribute("data-format", format);
    await expect(next).toHaveText("The next beat.");
    await expect(next).toHaveAttribute("data-format", nextFormat);
    await expect(
      next.locator("[data-comment-id], [data-entity-id]"),
    ).toHaveCount(0);
    const ids = await editor(page)
      .locator("p")
      .evaluateAll((nodes) => nodes.map((node) => node.dataset.blockId));
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });
}

test("selected text comments open with Ctrl+8, anchor, persist, resolve and reopen", async ({
  page,
}) => {
  const paragraph = block(page, "wire-action-1");
  const original = await paragraph.textContent();
  const quote = "Morning light settles";
  const start = original.indexOf(quote);
  await selectText(paragraph, start, start + quote.length);
  await page.keyboard.press("Control+8");
  await expect(page.locator(".comments-panel")).toBeVisible();
  await expect(page.locator(".composer-quote")).toContainText(quote);
  await page
    .getByRole("textbox", { name: "Write a comment" })
    .fill("Let the morning light establish the mood.");
  await page.getByRole("button", { name: "Post comment" }).click();
  const card = page
    .locator(".comment-card")
    .filter({ hasText: "Let the morning light establish the mood." });
  await expect(card).toContainText(quote);
  await expect(
    paragraph.locator("[data-comment-id]").filter({ hasText: quote }),
  ).toHaveText(quote);
  const commentId = await paragraph
    .locator("[data-comment-id]")
    .filter({ hasText: quote })
    .getAttribute("data-comment-id");
  await expect(paragraph).toHaveText(original);
  await savedProject(page, (project) =>
    project.comments.some(
      (comment) =>
        comment.text === "Let the morning light establish the mood." &&
        comment.quote === quote,
    ),
  );
  await page.reload();
  await expect(
    block(page, "wire-action-1")
      .locator("[data-comment-id]")
      .filter({ hasText: quote }),
  ).toHaveText(quote);
  await page
    .getByRole("button", { name: "Comments (Ctrl+8)", exact: true })
    .click();
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Resolve comment" }).click();
  await expect(card).toHaveCount(0);
  await expect(
    block(page, "wire-action-1")
      .locator("[data-comment-id]")
      .filter({ hasText: quote }),
  ).toHaveCount(0);
  await page
    .locator(".comment-filters")
    .getByRole("button", { name: /Resolved/ })
    .click();
  await expect(card).toBeVisible();
  await selectText(block(page, "wire-action-2"), 5);
  await card.getByRole("button", { name: "Reopen comment" }).click();
  await page
    .locator(".comment-filters")
    .getByRole("button", { name: /Open/ })
    .click();
  await expect(card).toBeVisible();
  const restoredMark = editor(page).locator(`[data-comment-id="${commentId}"]`);
  await expect(restoredMark).toHaveCount(1);
  await expect(restoredMark).toHaveText(quote);
  await expect(
    block(page, "wire-action-1").locator(`[data-comment-id="${commentId}"]`),
  ).toHaveText(quote);
  await expect(
    block(page, "wire-action-2").locator(`[data-comment-id="${commentId}"]`),
  ).toHaveCount(0);
  await savedProject(
    page,
    (project) =>
      project.comments.some(
        (comment) => comment.id === commentId && !comment.resolved,
      ) &&
      project.content.content.some((node) =>
        node.content?.some((part) =>
          part.marks?.some(
            (mark) => mark.type === "comment" && mark.attrs.id === commentId,
          ),
        ),
      ),
  );
  await page.reload();
  await expect(
    editor(page).locator(`[data-comment-id="${commentId}"]`),
  ).toHaveText(quote);
});

test("comment uses the captured passage after the editor cursor moves", async ({
  page,
}) => {
  const paragraph = block(page, "wire-action-1");
  const original = await paragraph.textContent();
  const quote = "Morning light settles";
  const start = original.indexOf(quote);
  await selectText(paragraph, start, start + quote.length);
  await page.keyboard.press("Control+8");
  await expect(page.locator(".composer-quote")).toContainText(quote);
  await selectText(block(page, "wire-action-2"), 8);
  await page
    .getByRole("textbox", { name: "Write a comment" })
    .fill("Keep this note attached to the original light.");
  await page.getByRole("button", { name: "Post comment" }).click();
  const mark = paragraph
    .locator("[data-comment-id]")
    .filter({ hasText: quote });
  await expect(mark).toHaveText(quote);
  const id = await mark.getAttribute("data-comment-id");
  await expect(
    block(page, "wire-action-2").locator(`[data-comment-id="${id}"]`),
  ).toHaveCount(0);
  await savedProject(page, (project) =>
    project.comments.some(
      (comment) =>
        comment.id === id &&
        comment.blockId === "wire-action-1" &&
        comment.quote === quote,
    ),
  );
});

test("removing a selected quote posts a general comment without a text mark", async ({
  page,
}) => {
  const paragraph = block(page, "wire-action-1");
  const marksBefore = await editor(page).locator("[data-comment-id]").count();
  await selectText(paragraph, 0, 9);
  await page.keyboard.press("Control+8");
  await expect(page.locator(".composer-quote")).toBeVisible();
  await page.getByRole("button", { name: "Remove selected quote" }).click();
  await expect(page.locator(".composer-quote")).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "Write a comment" })
    .fill("A general note about the whole draft.");
  await page.getByRole("button", { name: "Post comment" }).click();
  const card = page
    .locator(".comment-card")
    .filter({ hasText: "A general note about the whole draft." });
  await expect(card).toBeVisible();
  await expect(card.locator(".comment-quote")).toHaveCount(0);
  await expect(editor(page).locator("[data-comment-id]")).toHaveCount(
    marksBefore,
  );
  await savedProject(page, (project) =>
    project.comments.some(
      (comment) =>
        comment.text === "A general note about the whole draft." &&
        !comment.quote &&
        !comment.blockId,
    ),
  );
  await page.reload();
  await expect(editor(page).locator("[data-comment-id]")).toHaveCount(
    marksBefore,
  );
  await page
    .getByRole("button", { name: "Comments (Ctrl+8)", exact: true })
    .click();
  await expect(card).toBeVisible();
  await expect(card.locator(".comment-quote")).toHaveCount(0);
});

test("typing can be undone and redone without changing surrounding text", async ({
  page,
}) => {
  const paragraph = block(page, "wire-action-2");
  const original = await paragraph.textContent();
  await selectText(paragraph, 12);
  await page.keyboard.insertText("INSERTED ");
  const edited = original.slice(0, 12) + "INSERTED " + original.slice(12);
  await expect(paragraph).toHaveText(edited);
  await page.keyboard.press("Control+z");
  await expect(paragraph).toHaveText(original);
  await page.keyboard.press("Control+Shift+z");
  await expect(paragraph).toHaveText(edited);
  await expect(paragraph).toHaveAttribute("data-format", "action");
});

test("characters and props can be created from selected text and survive reload", async ({
  page,
}) => {
  const paragraph = block(page, "wire-action-1");
  const original = await paragraph.textContent();
  const characterQuote = "Eight men";
  await selectText(paragraph, 0, characterQuote.length);
  await page.getByRole("button", { name: "Components", exact: true }).click();
  await page
    .getByRole("button", { name: "Add character", exact: true })
    .click();
  const componentDialog = page.getByRole("dialog", { name: "New component" });
  await expect(componentDialog.getByLabel("Name", { exact: true })).toHaveValue(
    characterQuote,
  );
  await componentDialog.getByLabel("Name", { exact: true }).fill("Lena");
  await componentDialog
    .getByLabel(/^Description/)
    .fill("The observant detective.");
  await componentDialog
    .getByRole("button", { name: "Save component", exact: true })
    .click();
  await expect(
    page.locator(".component-item").filter({ hasText: "Lena" }),
  ).toBeVisible();
  await expect(
    paragraph.locator("[data-entity-id]").filter({ hasText: characterQuote }),
  ).toHaveText(characterQuote);

  const propQuote = "coffee cups";
  const start = original.indexOf(propQuote);
  await selectText(paragraph, start, start + propQuote.length);
  await page.getByRole("button", { name: "Props", exact: true }).click();
  await page
    .getByRole("button", { name: "Add prop", exact: true })
    .first()
    .click();
  const propDialog = page.getByRole("dialog", { name: "New prop" });
  await expect(propDialog.getByLabel("Prop name", { exact: true })).toHaveValue(
    propQuote,
  );
  await propDialog
    .getByLabel("Prop name", { exact: true })
    .fill("Ceramic coffee cups");
  await propDialog
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption("Objects");
  await propDialog.getByLabel("Quantity", { exact: true }).fill("3");
  await propDialog
    .getByLabel(/^Description/)
    .fill("Cream ceramic, matching set.");
  await propDialog
    .getByRole("button", { name: "Save prop", exact: true })
    .click();
  const propRow = page
    .locator(".prop-item")
    .filter({ hasText: "Ceramic coffee cups" });
  await expect(propRow).toContainText("Cream ceramic, matching set.");
  await expect(propRow.locator("b")).toHaveText("3");
  await expect(
    paragraph.locator("[data-entity-id]").filter({ hasText: propQuote }),
  ).toHaveText(propQuote);
  await savedProject(
    page,
    (project) =>
      project.components.some((item) => item.name === "Lena") &&
      project.props.some(
        (item) => item.name === "Ceramic coffee cups" && item.quantity === 3,
      ),
  );

  await page.reload();
  await page.getByRole("button", { name: "Components", exact: true }).click();
  await expect(
    page.locator(".component-item").filter({ hasText: "Lena" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Props", exact: true }).click();
  await expect(propRow.locator("b")).toHaveText("3");
  await expect(
    block(page, "wire-action-1")
      .locator("[data-entity-id]")
      .filter({ hasText: propQuote }),
  ).toHaveText(propQuote);
});

test("home creates an independent project and restores its screenplay after reload", async ({
  page,
}) => {
  await page.locator(".brand-button").click();
  await expect(
    page.getByRole("heading", { name: /All projects/ }),
  ).toBeVisible();
  await expect(page.locator(".home-project-card")).toHaveCount(4);
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Project title")
    .fill("The Last Train");
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(page.locator(".project-name")).toContainText("The Last Train");
  const scene = editor(page).locator("p").first();
  await selectText(scene, 0, (await scene.textContent()).length);
  await page.keyboard.insertText("EXT. STATION — DAWN");
  const action = editor(page).locator("p").nth(1);
  await selectText(action, 0);
  await page.keyboard.insertText("A train arrives through the morning mist.");
  await savedProject(
    page,
    (project) =>
      project.title === "The Last Train" &&
      JSON.stringify(project.content).includes(
        "A train arrives through the morning mist.",
      ),
  );
  await page.reload();
  await expect(page.locator(".project-name")).toContainText("The Last Train");
  await expect(editor(page).locator("p").first()).toHaveText(
    "EXT. STATION — DAWN",
  );
  await expect(editor(page).locator("p").nth(1)).toHaveText(
    "A train arrives through the morning mist.",
  );
  await page.locator(".brand-button").click();
  await expect(page.locator(".home-project-card")).toHaveCount(5);
  await page
    .getByRole("button", { name: "Open The Wire", exact: true })
    .click();
  await expect(block(page, "wire-scene-1")).toHaveText("INT. OFFICE — DAY");
  await expect(block(page, "wire-action-1")).toContainText(
    "Eight men dressed in BLACK SUITS",
  );
});

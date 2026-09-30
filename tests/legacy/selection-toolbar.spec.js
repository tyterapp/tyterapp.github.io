import { test, expect } from "@playwright/test";

const block = (page, id = "wire-action-1") =>
  page.locator(`.screenplay-editor p[data-block-id="${id}"]`);
const toolbar = (page) =>
  page.getByRole("toolbar", { name: "Selected text actions", exact: true });

// Use the browser's normal selection event, including ranges inside text marks.
async function selectText(locator, from, to = from) {
  await locator.evaluate(
    (element, offsets) => {
      element.closest('[contenteditable="true"]').focus();
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const nodes = [];
      let node;
      while ((node = walker.nextNode())) nodes.push(node);
      function point(offset) {
        for (const text of nodes) {
          if (offset <= text.textContent.length) return [text, offset];
          offset -= text.textContent.length;
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

async function selectPhrase(page, phrase, id = "wire-action-1") {
  const paragraph = block(page, id);
  const original = await paragraph.textContent();
  const start = original.indexOf(phrase);
  expect(start).toBeGreaterThanOrEqual(0);
  await selectText(paragraph, start, start + phrase.length);
  await expect(toolbar(page)).toBeVisible();
  return original;
}

async function savedProject(page, predicate) {
  await expect
    .poll(async () => {
      const projects = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("tyter.projects.v1") || "[]"),
      );
      return projects.some(predicate);
    })
    .toBe(true);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("textbox", { name: "Screenplay editor" }),
  ).toBeVisible();
});

test("selection actions appear only for selected screenplay text and hide at a caret", async ({
  page,
}) => {
  await expect(toolbar(page)).toHaveCount(0);
  await selectText(block(page), 5);
  await expect(toolbar(page)).toHaveCount(0);
  await selectPhrase(page, "Eight men");
  for (const name of [
    "Create component from selection",
    "Add selection to props",
    "Comment on selection",
    "Bold",
    "Italic",
    "Underline",
  ]) {
    await expect(
      toolbar(page).getByRole("button", { name, exact: true }),
    ).toBeVisible();
  }
  await selectText(block(page), 9);
  await expect(toolbar(page)).toHaveCount(0);
});

test("Escape dismisses selection actions without changing the text", async ({
  page,
}) => {
  const original = await selectPhrase(page, "coffee cups");
  await page.keyboard.press("Escape");
  await expect(toolbar(page)).toHaveCount(0);
  await expect(block(page)).toHaveText(original);
  await selectPhrase(page, "Morning light settles");
  await expect(toolbar(page)).toBeVisible();
});

test("a component created from the floating toolbar keeps its exact source and persists", async ({
  page,
}) => {
  const quote = "the table";
  const original = await block(page).textContent();
  const start = original.lastIndexOf(quote);
  expect(start).toBeGreaterThan(original.indexOf(quote));
  await selectText(block(page), start, start + quote.length);
  await expect(toolbar(page)).toBeVisible();
  await toolbar(page)
    .getByRole("button", {
      name: "Create component from selection",
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog", { name: "New component" });
  await expect(dialog.getByLabel("Name", { exact: true })).toHaveValue(quote);
  await expect(toolbar(page)).toHaveCount(0);
  await dialog.getByLabel("Name", { exact: true }).fill("The breakfast crew");
  await dialog
    .getByLabel(/^Description/)
    .fill("The people at the opening table.");
  await dialog
    .getByRole("button", { name: "Save component", exact: true })
    .click();
  await expect(
    page.locator(".component-item").filter({ hasText: "The breakfast crew" }),
  ).toBeVisible();
  const mark = block(page)
    .locator("[data-entity-id]")
    .filter({ hasText: quote });
  await expect(mark).toHaveText(quote);
  expect(
    await mark.evaluate((element) => {
      const before = document.createRange();
      before.selectNodeContents(element.closest("p"));
      before.setEndBefore(element);
      return before.toString().length;
    }),
  ).toBe(start);
  const id = await mark.getAttribute("data-entity-id");
  await expect(block(page)).toHaveText(original);
  await savedProject(page, (project) =>
    project.components.some(
      (item) =>
        item.id === id &&
        item.name === "The breakfast crew" &&
        item.blockId === "wire-action-1",
    ),
  );
  await page.reload();
  await expect(block(page).locator(`[data-entity-id="${id}"]`)).toHaveText(
    quote,
  );
  await expect(
    block(page, "wire-action-2").locator(`[data-entity-id="${id}"]`),
  ).toHaveCount(0);
});

test("selected text becomes a prop with its quantity, source mark, and saved record", async ({
  page,
}) => {
  const quote = "coffee cups";
  const original = await selectPhrase(page, quote);
  await toolbar(page)
    .getByRole("button", { name: "Add selection to props", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "New prop" });
  await expect(dialog.getByLabel("Prop name", { exact: true })).toHaveValue(
    quote,
  );
  await dialog.getByLabel("Quantity", { exact: true }).fill("8");
  await dialog.getByRole("button", { name: "Save prop", exact: true }).click();
  const row = page.locator(".prop-item").filter({ hasText: quote });
  await expect(row).toBeVisible();
  await expect(row.locator("b")).toHaveText("8");
  const mark = block(page)
    .locator("[data-entity-id]")
    .filter({ hasText: quote });
  await expect(mark).toHaveText(quote);
  const id = await mark.getAttribute("data-entity-id");
  await expect(block(page)).toHaveText(original);
  await savedProject(page, (project) =>
    project.props.some(
      (item) =>
        item.id === id &&
        item.name === quote &&
        item.quantity === 8 &&
        item.blockId === "wire-action-1",
    ),
  );
  await page.reload();
  await expect(block(page).locator(`[data-entity-id="${id}"]`)).toHaveText(
    quote,
  );
  await page.getByRole("button", { name: "Props", exact: true }).click();
  await expect(row.locator("b")).toHaveText("8");
});

test("Comment on selection focuses the composer and anchors the exact quote after saving", async ({
  page,
}) => {
  const quote = "Morning light settles";
  const original = await selectPhrase(page, quote);
  await toolbar(page)
    .getByRole("button", { name: "Comment on selection", exact: true })
    .click();
  const input = page.getByRole("textbox", { name: "Write a comment" });
  await expect(input).toBeFocused();
  await expect(page.locator(".composer-quote")).toContainText(quote);
  await expect(toolbar(page)).toHaveCount(0);
  await input.fill("Keep this light soft and indirect.");
  await page.getByRole("button", { name: "Post comment", exact: true }).click();
  const card = page
    .locator(".comment-card")
    .filter({ hasText: "Keep this light soft and indirect." });
  await expect(card.locator(".comment-quote")).toContainText(quote);
  const mark = block(page)
    .locator("[data-comment-id]")
    .filter({ hasText: quote });
  await expect(mark).toHaveText(quote);
  const id = await mark.getAttribute("data-comment-id");
  await expect(block(page)).toHaveText(original);
  await savedProject(page, (project) =>
    project.comments.some(
      (item) =>
        item.id === id &&
        item.quote === quote &&
        item.blockId === "wire-action-1",
    ),
  );
  await page.reload();
  await expect(block(page).locator(`[data-comment-id="${id}"]`)).toHaveText(
    quote,
  );
});

test("inline formatting preserves the selected phrase and can be toggled off", async ({
  page,
}) => {
  const quote = "Morning light settles";
  const original = await selectPhrase(page, quote);
  for (const [name, selector] of [
    ["Bold", "strong"],
    ["Italic", "em"],
    ["Underline", "u"],
  ]) {
    const button = toolbar(page).getByRole("button", { name, exact: true });
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(block(page).locator(selector)).toHaveText(quote);
    await expect
      .poll(() => page.evaluate(() => window.getSelection().toString()))
      .toBe(quote);
    await expect(block(page)).toHaveText(original);
  }
  await toolbar(page)
    .getByRole("button", { name: "Bold", exact: true })
    .click();
  await expect(block(page).locator("strong")).toHaveCount(0);
  await expect(block(page).locator("em")).toHaveText(quote);
  await expect(block(page).locator("u")).toHaveText(quote);
  await expect
    .poll(() => page.evaluate(() => window.getSelection().toString()))
    .toBe(quote);
  await expect(block(page)).toHaveText(original);
});

test("selection actions remain inside a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await selectPhrase(page, "Eight men");
  const bounds = await toolbar(page).boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(844);
  await expect(
    toolbar(page).getByRole("button", {
      name: "Comment on selection",
      exact: true,
    }),
  ).toBeVisible();
  await toolbar(page)
    .getByRole("button", { name: "Comment on selection", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Write a comment" }),
  ).toBeFocused();
});

test("scrolling the selected passage out of view hides its floating toolbar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 440 });
  await selectPhrase(page, "Eight men");
  const viewport = page.locator(".document-viewport");
  await viewport.evaluate((element) => {
    element.style.scrollBehavior = "auto";
    element.scrollTop = element.scrollHeight;
  });
  await expect
    .poll(() =>
      viewport.evaluate((element) => {
        const range =
          window.getSelection()?.rangeCount &&
          window.getSelection().getRangeAt(0);
        return (
          !!range &&
          range.getBoundingClientRect().bottom <=
            element.getBoundingClientRect().top
        );
      }),
    )
    .toBe(true);
  await expect(toolbar(page)).toHaveCount(0);
});

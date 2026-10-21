import { test, expect } from "@playwright/test";
import { createProject } from "../src/data.js";
import { grantPro } from "./helpers/pro-access.js";

test.use({
  isMobile: true,
  hasTouch: true,
  viewport: { width: 390, height: 844 },
  serviceWorkers: "block",
});
test.setTimeout(60000);

async function open(page, { theme = "light", long = false, pro = false } = {}) {
  if (pro) await grantPro(page);
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  const doc = createProject("Mobile writing");
  doc.id = "mobile-writing";
  doc.content.content = Array.from({ length: long ? 144 : 24 }, (_, i) => ({
    type: "paragraph",
    attrs: { format: i % 12 === 0 ? "scene" : "action", blockId: `m-${i}` },
    content: [
      {
        type: "text",
        text:
          i % 12 === 0
            ? `INT. ROOM ${i} — DAY`
            : "Anna watches the street. The story continues as she opens the door. ".repeat(
                2,
              ),
      },
    ],
  }));
  await page.addInitScript(
    ({ doc, theme }) => {
      localStorage.setItem("tyter.onboarding.v1", "done");
      localStorage.setItem("tyter.editor-intro.v1", "seen");
      if (sessionStorage.getItem("mobile-writing-seeded")) return;
      localStorage.setItem("tyter.projects.v1", JSON.stringify([doc]));
      localStorage.setItem("tyter.active", doc.id);
      localStorage.setItem("tyter.language.v1", "en");
      localStorage.setItem(
        "tyter.editor-preferences.v1",
        JSON.stringify({ theme }),
      );
      sessionStorage.setItem("mobile-writing-seeded", "yes");
    },
    { doc, theme },
  );
  await page.goto(pro ? "/pro" : "/free", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".screenplay-editor")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
}

async function componentsFromMenu(page) {
  await page.getByRole("button", { name: "Open tools", exact: true }).click();
  await page.getByRole("button", { name: "Components", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Screenplay panel", exact: true }),
  ).toBeVisible();
}

test("typing maps mobile pages without rebuilding the canonical document on each character", async ({
  page,
}) => {
  await open(page, { long: true });
  await page.locator('[data-block-id="m-1"]').click();
  await page.keyboard.press("End");
  await page.waitForTimeout(500);
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  await page.evaluate(() => {
    window.canonicalCopies = 0;
    new MutationObserver((records) =>
      records.forEach((record) =>
        record.addedNodes.forEach((node) => {
          if (node.nodeType === 1 && node.style?.left === "-20000px")
            window.canonicalCopies++;
        }),
      ),
    ).observe(document.body, { childList: true });
  });
  for (const character of "responsive") {
    await page.keyboard.type(character);
    await page.clock.runFor(32);
  }
  expect(await page.evaluate(() => window.canonicalCopies)).toBe(0);
  await page.clock.runFor(400);
  expect(await page.evaluate(() => window.canonicalCopies)).toBeGreaterThan(0);
  await expect(page.locator('[data-block-id="m-1"]')).toContainText(
    "responsive",
  );
});

test("mobile reading hides formatting, moves components into tools and removes the page chooser", async ({
  page,
}) => {
  await open(page);
  await expect(
    page.locator(".minimal-header .mobile-components-toggle"),
  ).toHaveCount(0);
  await expect(page.locator(".minimal-footer")).toHaveCount(0);
  await expect(page.locator(".mobile-page-version-bar")).toBeVisible();
  await expect(page.locator(".mobile-page-number")).toHaveText("1");
  await expect(
    page.getByRole("combobox", { name: "Page", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Open tools", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Components", exact: true }),
  ).toBeVisible();
});

for (const [width, theme] of [
  [320, "light"],
  [390, "dark"],
  [831, "light"],
]) {
  test(`${width}px ${theme}: page fills and separators are edge to edge; the visible page color is pinned and persists`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 844 });
    await open(page, { theme, long: true });
    const bar = page.locator(".mobile-page-version-bar");
    const picker = bar.getByRole("combobox");
    await picker.tap();
    await page.getByRole("option", { name: "v4 Yellow", exact: true }).tap();
    await expect(picker).toHaveAttribute("data-value", "yellow");
    await expect(bar.locator(".mobile-version-icon")).toHaveClass(
      /is-changing/,
    );
    expect(
      await bar
        .locator(".mobile-version-icon")
        .evaluate((n) => getComputedStyle(n).animationName),
    ).toBe("mobile-version-bounce");
    const geometry = await page.evaluate(() => {
      const scroll = document.querySelector(".minimal-scroll");
      const paper = document.querySelector(".script-paper");
      const fills = [...document.querySelectorAll(".revision-page-background")];
      const rects = [paper, ...fills].map((n) => ({
        left: n.getBoundingClientRect().left,
        width: n.getBoundingClientRect().width,
      }));
      return {
        rects,
        overflow: document.documentElement.scrollWidth,
        fill: getComputedStyle(fills[0]).backgroundColor,
        bar: getComputedStyle(
          document.querySelector(".mobile-page-version-bar"),
        ).backgroundColor,
        header: getComputedStyle(document.querySelector(".minimal-header"))
          .backgroundColor,
        padding: getComputedStyle(scroll).padding,
        divider: getComputedStyle(fills[1]).borderTopWidth,
      };
    });
    expect(geometry.overflow).toBe(width);
    expect(geometry.padding).toBe("0px");
    expect(geometry.divider).toBe("1px");
    expect(geometry.fill).toBe(geometry.bar);
    expect(geometry.fill).toBe(geometry.header);
    for (const rect of geometry.rects) {
      expect(Math.abs(rect.left)).toBeLessThan(1);
      expect(Math.abs(rect.width - width)).toBeLessThan(1);
    }
    const selection = await page
      .locator(".screenplay-editor")
      .evaluate((n) => n.editor.state.selection.from);
    await page.locator(".minimal-scroll").evaluate((n) => {
      n.scrollTop =
        parseFloat(
          n.querySelector('[data-page="2"].revision-page-background').style.top,
        ) + 4;
    });
    await expect(bar).toHaveAttribute("data-page", "2");
    await expect(picker).toHaveAttribute("data-value", "white");
    await picker.tap();
    await expect(bar).toHaveAttribute("data-page", "2");
    await page.getByRole("option", { name: "v2 Blue", exact: true }).tap();
    await expect(picker).toHaveAttribute("data-value", "blue");
    expect(
      await page
        .locator(".screenplay-editor")
        .evaluate((n) => n.editor.state.selection.from),
    ).toBe(selection);
    const boxes = await Promise.all([
      bar.boundingBox(),
      page.locator(".minimal-scroll").boundingBox(),
    ]);
    expect(Math.abs(boxes[0].y + boxes[0].height - boxes[1].y)).toBeLessThan(1);
    await page.screenshot({
      path: info.outputPath(`writing-${width}-${theme}.png`),
    });
    await expect(
      page.locator('.revision-page-background[data-page="1"]'),
    ).toHaveAttribute("data-revision-color", "yellow");
    await expect
      .poll(async () =>
        page.evaluate(async () => {
          const documents = await new Promise((resolve, reject) => {
            const request = indexedDB.open("tyter.local-files.v1", 1);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
              const db = request.result;
              const read = db
                .transaction("files")
                .objectStore("files")
                .get("documents");
              read.onsuccess = () => {
                db.close();
                resolve(read.result || []);
              };
              read.onerror = () => {
                db.close();
                reject(read.error);
              };
            };
          });
          return documents
            .find((d) => d.id === "mobile-writing")
            ?.pageVersions?.pages.slice(0, 2)
            .map((p) => p.active);
        }),
      )
      .toEqual(["yellow", "blue"]);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(
      page.locator('.revision-page-background[data-page="1"]'),
    ).toHaveAttribute("data-revision-color", "yellow");
    await expect(
      page.locator('.revision-page-background[data-page="2"]'),
    ).toHaveAttribute("data-revision-color", "blue");
  });
}

test("typing, paste, touch formatting, undo and composition preserve the document and toolbar session", async ({
  page,
}) => {
  await open(page);
  const block = page.locator('[data-block-id="m-1"]');
  await block.tap();
  await expect(page.locator(".minimal-footer")).toHaveCount(0);
  await page.keyboard.press("End");
  await page.keyboard.type("Typing ");
  await expect(page.locator(".minimal-footer")).toBeVisible();
  await page.getByRole("button", { name: "Dialogue", exact: true }).tap();
  await expect(block).toHaveAttribute("data-format", "speech");
  await expect(page.locator(".screenplay-editor")).toBeFocused();
  await page.keyboard.insertText("Автозамена ");
  await expect(block).toContainText("Автозамена");
  await page.keyboard.press("Control+z");
  await expect(block).not.toContainText("Автозамена");
  await page.locator(".screenplay-editor").evaluate((node) => {
    const data = new DataTransfer();
    data.setData("text/plain", "Pasted text ");
    node.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: data,
      }),
    );
    node.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true, data: "" }),
    );
    node.editor.commands.insertContent("Составной");
    node.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        inputType: "insertCompositionText",
        data: "Составной",
        isComposing: true,
      }),
    );
    node.dispatchEvent(
      new CompositionEvent("compositionend", {
        bubbles: true,
        data: "Составной",
      }),
    );
  });
  await expect(block).toContainText("Pasted text Составной");
  await expect(page.locator(".minimal-footer")).toBeVisible();
  await page.getByRole("button", { name: "Open tools", exact: true }).tap();
  await expect(page.locator(".minimal-footer")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-block-id="m-1"]')).toContainText(
    "Pasted text Составной",
  );
  await expect(page.locator(".minimal-footer")).toHaveCount(0);
});

test("components remain accessible from tools in both mobile modes", async ({
  page,
}) => {
  await open(page, { pro: true });
  await page.locator('[data-block-id="m-0"]').tap();
  await page.keyboard.press("End");
  await page.keyboard.insertText(" UPDATED");
  await componentsFromMenu(page);
  await page.keyboard.press("Escape");
  await page
    .locator(".mobile-mode-tabs")
    .getByRole("button", { name: "Storyboard", exact: true })
    .tap();
  await expect(page.locator(".storyboard-workspace")).toBeVisible();
  await expect(page.locator(".story-card-caption").first()).toContainText(
    "UPDATED",
  );
  await componentsFromMenu(page);
});

test("first paste activates formatting without requiring a keyboard character", async ({
  page,
}) => {
  await open(page);
  await page.locator('[data-block-id="m-1"]').tap();
  await expect(page.locator(".minimal-footer")).toHaveCount(0);
  await page.locator(".screenplay-editor").evaluate((node) => {
    const data = new DataTransfer();
    data.setData("text/plain", "First paste ");
    node.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: data,
      }),
    );
  });
  await expect(page.locator(".minimal-footer")).toBeVisible();
  await expect(page.locator('[data-block-id="m-1"]')).toContainText(
    "First paste",
  );
});

test("a metadata repaint cannot discard an already queued canonical measurement", async ({
  page,
}) => {
  await open(page, { long: true });
  await page.evaluate(() => {
    window.queuedCopies = 0;
    new MutationObserver((records) =>
      records.forEach((record) =>
        record.addedNodes.forEach((node) => {
          if (node.nodeType === 1 && node.style?.left === "-20000px")
            window.queuedCopies++;
        }),
      ),
    ).observe(document.body, { childList: true });
    const node = document.querySelector(".screenplay-editor");
    const original = window.requestAnimationFrame;
    let injected = false;
    window.requestAnimationFrame = (callback) => {
      const id = original.call(window, callback);
      if (!injected) {
        injected = true;
        queueMicrotask(() =>
          node.editor.view.dispatch(
            node.editor.state.tr.setMeta("pageVersionLayout", true),
          ),
        );
      }
      return id;
    };
    node.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true, data: "" }),
    );
  });
  await expect
    .poll(() => page.evaluate(() => window.queuedCopies))
    .toBeGreaterThan(0);
});

test("character reading hides page editing controls", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Open tools", exact: true }).tap();
  await page
    .getByRole("button", { name: "Character dialogues", exact: true })
    .tap();
  await expect(page.locator(".character-dialogue-view")).toBeVisible();
  await expect(page.locator(".mobile-page-version-bar")).toHaveCount(0);
});

test("hardware keyboard color selection returns focus to the mobile trigger", async ({
  page,
}) => {
  await open(page);
  const picker = page.locator(".mobile-page-version-bar").getByRole("combobox");
  await picker.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("option", { name: "v1 White", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(picker).toHaveAttribute("data-value", "blue");
  await expect(picker).toBeFocused();
});

test("reduced motion disables revision bounce and desktop resize restores desktop controls", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page);
  const picker = page.locator(".mobile-page-version-bar").getByRole("combobox");
  await picker.tap();
  await page.getByRole("option", { name: "v3 Pink", exact: true }).tap();
  await expect(picker).toHaveAttribute("data-value", "pink");
  expect(
    await page
      .locator(".mobile-version-icon")
      .evaluate((n) => getComputedStyle(n).animationName),
  ).toBe("none");
  await page.locator('[data-block-id="m-1"]').tap();
  await page.keyboard.insertText("Retained ");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.locator(".minimal-app")).not.toHaveAttribute(
    "data-mobile",
    "true",
  );
  await expect(page.locator(".mobile-page-version-bar")).toHaveCount(0);
  await expect(page.locator(".minimal-footer")).toBeVisible();
  await expect(page.locator(".page-version-controls")).toBeVisible();
  expect(
    (await page.locator(".script-paper").boundingBox()).width,
  ).toBeLessThan(1440);
  await expect(page.locator('[data-block-id="m-1"]')).toContainText("Retained");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".mobile-page-version-bar")).toBeVisible();
  await expect(page.locator(".minimal-footer")).toHaveCount(0);
});

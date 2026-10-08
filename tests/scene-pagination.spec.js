import { test, expect } from "@playwright/test";
import { createProject } from "../src/data.js";
import { grantPro } from "./helpers/pro-access.js";
import { selectAppOption } from "./helpers/app-select.js";

const paragraph = (format, text, blockId, attrs = {}) => ({
  type: "paragraph",
  attrs: { format, blockId, ...attrs },
  content: [{ type: "text", text }],
});
function fixture(zoom) {
  const doc = createProject("Страницы вариантов");
  doc.id = "variant-pages";
  doc.metadata.documentZoom = zoom;
  const heading = (letter) =>
    paragraph("scene", "ИНТ. ДОМ — ДЕНЬ", "scene", { sceneVariant: letter });
  doc.content.content = [
    heading("A"),
    paragraph("action", "Короткий вариант A.", "a"),
  ];
  doc.sceneVariants = {
    scene: {
      B: [
        heading("B"),
        ...Array.from({ length: 55 }, (_, index) =>
          paragraph(
            "action",
            `Действие ${index + 1}. Героиня идёт по улице. `.repeat(4),
            `b-${index}`,
          ),
        ),
      ],
      F: [
        heading("F"),
        paragraph("action", "Героиня идёт по улице. ".repeat(260), "f"),
      ],
    },
  };
  doc.outline = {
    columns: [{ id: "act", title: "Акт 1" }],
    cards: [
      {
        id: "card",
        columnId: "act",
        title: "Дом",
        text: "",
        color: "#33313b",
        drama: 3,
        blockId: "scene",
        comments: [],
      },
    ],
  };
  return doc;
}
async function open(page, zoom) {
  await grantPro(page);
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  await page.addInitScript((doc) => {
    localStorage.setItem("tyter.onboarding.v1", "done");
    localStorage.setItem("tyter.projects.v1", JSON.stringify([doc]));
    localStorage.setItem("tyter.active", doc.id);
    localStorage.setItem("tyter.language.v1", "ru");
  }, fixture(zoom));
  await page.goto("/pro");
  await expect(page.locator(".screenplay-editor")).toBeFocused();
  await page.evaluate(() => document.fonts.ready);
}
const layout = (page) =>
  page.locator(".script-paper").evaluate((paper) => {
    const bounds = paper.getBoundingClientRect();
    const scale = bounds.width / paper.offsetWidth;
    const pageHeight = parseFloat(
      paper.querySelector(".page-guide").style.height,
    );
    const margin = parseFloat(
      getComputedStyle(paper).getPropertyValue("--page-margin"),
    );
    const walker = document.createTreeWalker(
      paper.querySelector(".screenplay-editor"),
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) =>
          node.parentElement.closest(
            '[contenteditable="false"], .ProseMirror-widget',
          )
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_ACCEPT,
      },
    );
    let node;
    const overflow = [];
    while ((node = walker.nextNode())) {
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) {
        if (!rect.width || !rect.height) continue;
        const top = (rect.top - bounds.top) / scale;
        const bottom = (rect.bottom - bounds.top) / scale;
        const page = Math.floor(top / pageHeight);
        if (
          top < page * pageHeight + margin - 1 ||
          bottom > (page + 1) * pageHeight - margin + 1
        )
          overflow.push({ top, bottom, text: node.textContent.slice(0, 30) });
      }
    }
    return {
      pages: paper.querySelectorAll(".page-guide").length,
      height: bounds.height / scale,
      pageHeight,
      overflow,
    };
  });

for (const zoom of [100, 200]) {
  test(`${zoom}%: changing scene variants recalculates pages, sheet height and paragraph breaks in both directions`, async ({
    page,
  }) => {
    await open(page, zoom);
    const selector = page.getByRole("combobox", {
      name: "Вариант сцены 1",
      exact: true,
    });
    await expect(page.locator(".page-guide")).toHaveCount(1);
    for (const letter of ["B", "F"]) {
      await selectAppOption(page, selector, letter);
      await expect
        .poll(() => page.locator(".page-guide").count())
        .toBeGreaterThan(2);
      await expect.poll(async () => (await layout(page)).overflow).toEqual([]);
      const expanded = await layout(page);
      expect(expanded.height).toBeGreaterThanOrEqual(
        expanded.pages * expanded.pageHeight - 1,
      );
      await selectAppOption(page, selector, "A");
      await expect(page.locator(".page-guide")).toHaveCount(1);
      const compact = await layout(page);
      expect(compact.height).toBeCloseTo(compact.pageHeight, 0);
      expect(compact.overflow).toEqual([]);
    }
  });
}

test("the entire outline card opens its editor while the menu and scene navigation keep their actions", async ({
  page,
}) => {
  await open(page, 100);
  await page.getByRole("button", { name: "Аутлайн", exact: true }).click();
  const card = page.locator('.outline-card[data-card-id="card"]');
  const bounds = await card.boundingBox();
  await page.mouse.click(
    bounds.x + bounds.width - 5,
    bounds.y + bounds.height - 5,
  );
  await expect(
    page.getByLabel("Название карточки", { exact: true }),
  ).toHaveValue("Дом");
  await page
    .getByRole("button", { name: "Закрыть карточку", exact: true })
    .click();
  await card
    .getByRole("button", { name: "Действия с карточкой Дом", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Дублировать карточку", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".outline-card-drawer")).toHaveCount(0);
  await card
    .getByRole("button", { name: "Перейти к сцене Дом", exact: true })
    .click();
  await expect(page.locator(".screenplay-editor")).toBeVisible();
  await expect(page.locator(".outline-card-drawer")).toHaveCount(0);
});

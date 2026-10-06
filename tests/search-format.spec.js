import { test, expect } from "@playwright/test";
import { createProject } from "../src/data.js";
import { grantPro } from "./helpers/pro-access.js";

const formats = [
  ["scene", "Заголовок сцены", "Scene heading", "ИНТ. ЛАМПА — ДЕНЬ"],
  ["action", "Действие", "Action", "Лампа светит. ЛАМПА стоит на столе."],
  ["character", "Персонаж", "Character", "ЛАМПА"],
  ["speech", "Реплика", "Dialogue", "Лампа горит."],
  ["parenthetical", "Ремарка", "Parenthetical", "(лампа мигает)"],
  ["transition", "Переход", "Transition", "ЛАМПА ГАСНЕТ:"],
  ["plain", "Обычный текст", "Plain text", "Лампа: заметка для съёмок."],
];
const paragraph = (format, text, blockId) => ({
  type: "paragraph",
  attrs: { format, blockId },
  content: [{ type: "text", text }],
});
async function open(page, edition = "free") {
  if (edition === "pro") await grantPro(page);
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ json: { documents: [], directory: "Test" } }),
  );
  const project = createProject("Фильтр форматов");
  project.content.content = formats.map(([format, , , text]) =>
    paragraph(format, text, format),
  );
  project.content.content[1].content = [
    { type: "text", text: "Ла", marks: [{ type: "bold" }] },
    { type: "text", text: "мпа", marks: [{ type: "italic" }] },
    { type: "text", text: " светит. ЛАМПА стоит на столе." },
  ];
  project.content.content.push(
    ...Array.from({ length: 65 }, (_, i) =>
      paragraph("action", `Действие ${i + 1}.`, `filler-${i}`),
    ),
    paragraph("action", "Дальняя лампа светит.", "far"),
  );
  await page.addInitScript((project) => {
    localStorage.setItem("tyter.projects.v1", JSON.stringify([project]));
    localStorage.setItem("tyter.active", project.id);
    localStorage.setItem("tyter.onboarding.v1", "done");
    localStorage.setItem("tyter.language.v1", "ru");
  }, project);
  await page.goto(`/${edition}`);
  await expect(page.locator(".screenplay-editor")).toBeVisible();
  await page.keyboard.press("Control+f");
  await expect(page.getByLabel("Поиск по тексту")).toBeFocused();
}
const highlightCount = (page) =>
  page
    .locator(".script-search-result")
    .evaluateAll(
      (nodes) => new Set(nodes.map((node) => node.dataset.searchIndex)).size,
    );

for (const edition of ["free", "pro"])
  test(`${edition}: format filter keeps result cards, highlights and navigation in sync`, async ({
    page,
  }) => {
    await open(page, edition);
    const filter = page.getByRole("combobox", {
      name: "Формат текста",
      exact: true,
    });
    const query = page.getByLabel("Поиск по тексту", { exact: true });
    const cards = page.locator(".search-result-card");
    const count = page.locator(".search-count");
    await expect(filter).toHaveValue("all");
    await query.fill("лампа");
    await expect(cards).toHaveCount(9);
    await expect.poll(() => highlightCount(page)).toBe(9);
    for (const [format, label] of formats) {
      await filter.selectOption(format);
      const matches = format === "action" ? 3 : 1;
      await expect(cards).toHaveCount(matches);
      await expect(count).toHaveText(`1 / ${matches}`);
      await expect.poll(() => highlightCount(page)).toBe(matches);
      const visibleFormats = await page
        .locator(".script-search-result")
        .evaluateAll((nodes) =>
          nodes.map((node) => node.closest("p").dataset.format),
        );
      expect(new Set(visibleFormats)).toEqual(new Set([format]));
      for (const card of await cards.all())
        await expect(card.locator(".search-result-meta")).toContainText(label);
    }
    await filter.selectOption("action");
    await cards.last().click();
    await expect(count).toHaveText("3 / 3");
    const distant = page.locator('p[data-block-id="far"] .search-from-card');
    await expect(distant).toHaveText("лампа");
    await expect(distant).toHaveCSS("background-color", "rgb(255, 202, 133)");
    await expect
      .poll(() =>
        distant.evaluate((node) => {
          const rect = node.getBoundingClientRect();
          const scroll = node
            .closest(".minimal-scroll")
            .getBoundingClientRect();
          return rect.top >= scroll.top && rect.bottom <= scroll.bottom;
        }),
      )
      .toBe(true);
    await query.press("Shift+Enter");
    await expect(count).toHaveText("2 / 3");
    await expect(page.locator(".search-from-card")).toHaveCount(0);
    await query.press("Enter");
    await expect(count).toHaveText("3 / 3");
    await page
      .getByRole("button", { name: "Следующее совпадение", exact: true })
      .click();
    await expect(count).toHaveText("1 / 3");
    await query.fill("несуществующее слово");
    await expect(count).toHaveText("Нет совпадений");
    await expect(cards).toHaveCount(0);
    await expect.poll(() => highlightCount(page)).toBe(0);
    await expect(
      page.getByRole("button", { name: "Следующее совпадение", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Предыдущее совпадение", exact: true }),
    ).toBeDisabled();
    await query.fill("лампа");
    await expect(count).toHaveText("1 / 3");
    await filter.selectOption("all");
    await expect(count).toHaveText("1 / 9");
    await expect.poll(() => highlightCount(page)).toBe(9);
    await page
      .getByRole("button", { name: "Закрыть поиск", exact: true })
      .click();
    await expect(page.locator(".script-search-result")).toHaveCount(0);
  });

test("format filter and result labels switch to English and fit the mobile sidebar", async ({
  page,
}, info) => {
  await open(page);
  await page.getByLabel("Поиск по тексту").fill("лампа");
  await page.getByRole("button", { name: "ENG", exact: true }).click();
  const filter = page.getByRole("combobox", {
    name: "Text format",
    exact: true,
  });
  await expect(filter.locator("option")).toHaveText([
    "All formats",
    ...formats.map(([, , label]) => label),
  ]);
  await filter.selectOption("speech");
  await expect(page.locator(".search-result-meta")).toContainText("Dialogue");
  await expect(page.locator(".search-count")).toHaveText("1 / 1");
  await page.screenshot({ path: info.outputPath("desktop-search-filter.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(filter).toBeInViewport();
  const bounds = await filter.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: info.outputPath("mobile-search-filter.png") });
  await page.keyboard.press("Escape");
  await expect(page.locator(".search-drawer")).toHaveCount(0);
});

import { test, expect } from "@playwright/test";
import { createProject } from "../src/data.js";
import { grantPro } from "./helpers/pro-access.js";

const paragraph = (format, text, blockId, commentId) => ({
  type: "paragraph",
  attrs: { format, blockId },
  content: [
    {
      type: "text",
      text,
      ...(commentId
        ? { marks: [{ type: "comment", attrs: { id: commentId } }] }
        : {}),
    },
  ],
});
async function open(page, project) {
  await grantPro(page);
  await page.addInitScript((project) => {
    if (!sessionStorage.getItem("drama-seeded")) {
      localStorage.setItem("tyter.projects.v1", JSON.stringify([project]));
      localStorage.setItem("tyter.active", project.id);
      sessionStorage.setItem("drama-seeded", "true");
    }
  }, project);
  await page.goto("/pro");
  await expect(page.locator(".screenplay-editor")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}
const stored = (page) =>
  page.evaluate(async () => {
    const { browserRequest } = await import("/src/browser-files.js");
    return (await browserRequest("documents")).documents[0];
  });

test("drama graph stays above editable cards, updates live and closes back to its button", async ({
  page,
}, info) => {
  const project = createProject("Драматичность");
  project.outline = {
    columns: [
      { id: "act-1", title: "Начало" },
      { id: "act-2", title: "Кульминация" },
      { id: "act-3", title: "Финал" },
    ],
    cards: [
      {
        id: "card-1",
        title: "Знакомство",
        columnId: "act-1",
        text: "Мир героя",
        drama: 2,
      },
      {
        id: "card-2",
        title: "Риск",
        columnId: "act-2",
        text: "Всё поставлено на карту",
        drama: 10,
      },
      {
        id: "card-3",
        title: "Возвращение",
        columnId: "act-3",
        text: "Развязка",
        drama: 0,
      },
    ],
  };
  await open(page, project);
  await page.getByRole("button", { name: "Аутлайн", exact: true }).click();
  await page.getByRole("button", { name: "Знакомство", exact: true }).click();
  const slider = page.getByLabel("Драматичность карточки", { exact: true });
  await expect(slider).toHaveValue("2");
  await slider.fill("7");
  await expect(page.locator(".outline-drama-control output")).toHaveText(
    "7/10",
  );
  await slider.press("End");
  await expect(slider).toHaveValue("10");
  await slider.press("Home");
  await expect(slider).toHaveValue("0");
  await slider.fill("7");
  await expect
    .poll(async () => (await stored(page))?.outline?.cards?.[0]?.drama)
    .toBe(7);
  await page.getByLabel("Поиск карточек", { exact: true }).fill("Знакомство");
  const cardSidebar = page.getByRole("complementary", {
    name: "Редактирование карточки",
  });
  const originalSidebar = await cardSidebar.boundingBox();
  await page
    .getByRole("button", { name: "График драматичности", exact: true })
    .click();
  const graph = page.getByRole("complementary", {
    name: "График драматичности",
    exact: true,
  });
  await expect(graph).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "График драматичности" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "График драматичности", exact: true }),
  ).toHaveCount(0);
  const bounds = await graph.boundingBox();
  const boardBounds = await page.locator(".outline-workspace").boundingBox();
  const cardBounds = await page
    .getByRole("complementary", { name: "Редактирование карточки" })
    .boundingBox();
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(boardBounds.y + 1);
  expect(cardBounds.y).toBeCloseTo(originalSidebar.y, 0);
  expect(cardBounds.height).toBeCloseTo(originalSidebar.height, 0);
  expect(bounds.x + bounds.width).toBeCloseTo(cardBounds.x, 0);
  expect(bounds.y).toBeCloseTo(cardBounds.y, 0);
  const addAct = await page
    .getByRole("button", { name: "Добавить акт", exact: true })
    .boundingBox();
  const searchBox = await page.locator(".outline-search").boundingBox();
  expect(searchBox.y + searchBox.height / 2).toBeCloseTo(
    addAct.y + addAct.height / 2,
    0,
  );
  expect(boardBounds.height).toBeGreaterThan(300);
  // The chart expands and contracts with the main area, while the sidebar stays full height.
  const svgWidth = () =>
    graph
      .getByRole("group", { name: "Драматичность по актам" })
      .evaluate((node) => node.viewBox.baseVal.width);
  const originalPlotWidth = await svgWidth();
  await page
    .getByRole("button", { name: "Закрыть карточку", exact: true })
    .click();
  await expect(cardSidebar).toHaveCount(0);
  await expect
    .poll(svgWidth)
    .toBeCloseTo(originalPlotWidth + originalSidebar.width, 0);
  await graph
    .getByRole("button", {
      name: "Знакомство: драматичность 7 из 10",
      exact: true,
    })
    .click();
  await expect(cardSidebar).toBeVisible();
  await expect.poll(svgWidth).toBeCloseTo(originalPlotWidth, 0);
  await expect
    .poll(async () => (await cardSidebar.boundingBox()).y)
    .toBeCloseTo(originalSidebar.y, 0);
  await expect(graph.locator('[aria-pressed="true"]')).toHaveAttribute(
    "aria-label",
    "Знакомство: драматичность 7 из 10",
  );
  // Editing stays available while the chart is open and changes its points.
  const title = page.getByLabel("Название карточки", { exact: true });
  await title.fill("Знакомство с героем");
  await expect(title).toBeFocused();
  await expect(
    graph.getByRole("button", {
      name: "Знакомство с героем: драматичность 7 из 10",
    }),
  ).toBeVisible();
  await title.fill("Знакомство");
  await page
    .getByLabel("Текст карточки", { exact: true })
    .fill("Мир героя — новая версия");
  await slider.fill("8");
  await expect(
    graph.getByRole("button", { name: "Знакомство: драматичность 8 из 10" }),
  ).toBeVisible();
  await expect(graph.locator(".outline-drama-preview")).toContainText(
    "Начало · 8/10",
  );
  await slider.fill("7");
  await expect(graph.locator(".outline-drama-act")).toHaveText([
    "Начало",
    "Кульминация",
    "Финал",
  ]);
  await expect(graph.locator(".outline-drama-point")).toHaveCount(3);
  await expect(graph.locator(".outline-drama-point").first()).toHaveAttribute(
    "tabindex",
    "0",
  );
  const values = await graph
    .locator(".outline-drama-point")
    .evaluateAll((items) =>
      items.map((el) => ({
        x: Number(el.querySelector("circle").getAttribute("cx")),
        y: Number(el.querySelector("circle").getAttribute("cy")),
      })),
    );
  expect(values[0].x).toBeLessThan(values[1].x);
  expect(values[1].x).toBeLessThan(values[2].x);
  expect(values[1].y).toBeLessThan(values[0].y);
  expect(values[0].y).toBeLessThan(values[2].y);
  await graph
    .getByRole("button", { name: "Риск: драматичность 10 из 10", exact: true })
    .focus();
  await expect(graph.locator(".outline-drama-preview")).toContainText(
    "Кульминация · 10/10",
  );
  await page.screenshot({ path: info.outputPath("drama-chart.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(graph).toBeInViewport();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBe(390);
  const mobileGraph = await graph.boundingBox();
  const mobileSidebar = await cardSidebar.boundingBox();
  expect(mobileGraph.x + mobileGraph.width).toBeCloseTo(mobileSidebar.x, 0);
  expect(mobileGraph.y).toBeCloseTo(mobileSidebar.y, 0);
  await expect
    .poll(() =>
      graph
        .locator(".outline-drama-scroll")
        .evaluate((node) => node.scrollWidth - node.clientWidth),
    )
    .toBeLessThanOrEqual(1);
  const mobileAdd = await page
    .getByRole("button", { name: "Добавить акт", exact: true })
    .boundingBox();
  const mobileSearch = await page.locator(".outline-search").boundingBox();
  expect(mobileSearch.y + mobileSearch.height / 2).toBeCloseTo(
    mobileAdd.y + mobileAdd.height / 2,
    0,
  );
  await page.screenshot({ path: info.outputPath("drama-chart-mobile.png") });
  await page.keyboard.press("Enter");
  await expect(graph).toBeVisible();
  await expect(page.getByLabel("Название карточки")).toHaveValue("Риск");
  await expect(slider).toHaveValue("10");
  await expect(graph.locator('[aria-pressed="true"]')).toHaveAttribute(
    "aria-label",
    "Риск: драматичность 10 из 10",
  );
  await expect(page.getByLabel("Название карточки")).toBeInViewport();
  await page.screenshot({
    path: info.outputPath("drama-chart-editing-mobile.png"),
  });
  await graph
    .getByRole("button", { name: "Закрыть график", exact: true })
    .click();
  await expect(graph).toHaveCount(0);
  const graphButton = page.getByRole("button", {
    name: "График драматичности",
    exact: true,
  });
  await expect(graphButton).toBeVisible();
  await expect(graphButton).toBeFocused();
  await graphButton.click();
  await expect(graph).toBeVisible();
  await expect(graphButton).toHaveCount(0);
  await expect(slider).toHaveValue("10");
  await graph
    .getByRole("button", { name: "Закрыть график", exact: true })
    .click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.reload();
  await page.getByRole("button", { name: "Аутлайн", exact: true }).click();
  await page.getByRole("button", { name: "Знакомство", exact: true }).click();
  await expect(slider).toHaveValue("7");
  await page
    .getByRole("button", {
      name: "Действия с карточкой Знакомство",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Дублировать карточку", exact: true })
    .click();
  await expect
    .poll(async () => (await stored(page)).outline.cards.length)
    .toBe(4);
  const clone = (await stored(page)).outline.cards.find(
    (card) => card.id !== "card-1" && card.title.startsWith("Знакомство"),
  );
  expect(clone.drama).toBe(7);
});

test("comment cards animate to distant text and a second click cancels the previous transition", async ({
  page,
}) => {
  const project = createProject("Длинный сценарий");
  project.content.content = [paragraph("scene", "ИНТ. ДОМ — ДЕНЬ", "scene")];
  project.content.content.push(
    paragraph("action", "Первый комментарий", "first", "first-note"),
  );
  for (let i = 0; i < 80; i++)
    project.content.content.push(
      paragraph(
        "action",
        "Пауза. " + "Дождь стучит по крыше. ".repeat(3),
        `long-${i}`,
      ),
    );
  project.content.content.push(
    paragraph("action", "Последний комментарий", "last", "last-note"),
  );
  project.comments = [
    {
      id: "first-note",
      text: "Начало",
      quote: "Первый комментарий",
      blockId: "first",
      resolved: false,
    },
    {
      id: "last-note",
      text: "Финал",
      quote: "Последний комментарий",
      blockId: "last",
      resolved: false,
    },
  ];
  await open(page, project);
  await page.getByRole("button", { name: "Комментарии", exact: true }).click();
  const panel = page.getByRole("complementary", {
    name: "Комментарии сценария",
    exact: true,
  });
  const first = panel.locator(".comment-card").filter({ hasText: "Начало" });
  const last = panel.locator(".comment-card").filter({ hasText: "Финал" });
  const scroller = page.locator(".minimal-scroll");
  await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBe(0);
  await scroller.evaluate((el) => {
    window.commentScrollSamples = [];
    el.addEventListener("scroll", () =>
      window.commentScrollSamples.push(el.scrollTop),
    );
  });
  await last.click();
  await expect(
    page.locator('[data-block-id="last"] .comment-open-selected'),
  ).toBeInViewport();
  await expect
    .poll(() => scroller.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(3000);
  await expect
    .poll(() => page.evaluate(() => window.commentScrollSamples.length))
    .toBeGreaterThan(3);
  const values = await page.evaluate(() => window.commentScrollSamples);
  expect(
    values.some((value) => value > 100 && value < values.at(-1) - 100),
  ).toBe(true);
  await first.click();
  await last.click();
  await expect(
    page.locator('[data-block-id="last"] .comment-open-selected'),
  ).toBeInViewport();
  await page.waitForTimeout(350);
  await expect(page.locator('[data-block-id="last"]')).toBeInViewport();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await first.click();
  await expect(
    page.locator('[data-block-id="first"] .comment-open-selected'),
  ).toBeInViewport();
  await expect(scroller).toHaveJSProperty("scrollTop", 0);
});

test("PDF uses TYT sheet dimensions, margins, paragraph spacing and default Courier", async ({
  page,
}, info) => {
  const project = createProject("Отступы PDF");
  project.metadata = { fontFamily: "courier", fontSize: 12 };
  project.content.content = [
    paragraph("scene", "ИНТ. ДОМ — ДЕНЬ", "scene"),
    paragraph("action", "Лампа горит у окна.", "action"),
    paragraph("character", "АННА", "character"),
    paragraph("parenthetical", "(тихо)", "parenthetical"),
    paragraph("speech", "Она помнит этот берег.", "speech"),
    paragraph("transition", "ЗАТЕМНЕНИЕ:", "transition"),
    paragraph("plain", "Продолжение сцены. € ₽", "plain"),
  ];
  for (let i = 0; i < 48; i++)
    project.content.content.push(
      paragraph(
        "action",
        `Абзац ${i}. ` + "Дождь за окном и огни города. ".repeat(5),
        `long-${i}`,
      ),
    );
  await open(page, project);
  const positions = await page
    .locator(".screenplay-editor p")
    .evaluateAll((elements) => {
      const paper = elements[0]
        .closest(".script-paper")
        .getBoundingClientRect();
      return {
        width: paper.width,
        blocks: elements.slice(0, 7).map((el) => {
          const range = document.createRange();
          const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
            acceptNode: (node) =>
              node.parentElement.closest(".ProseMirror-widget")
                ? NodeFilter.FILTER_REJECT
                : NodeFilter.FILTER_ACCEPT,
          });
          const text = walker.nextNode();
          range.selectNodeContents(text);
          const rect = range.getBoundingClientRect();
          return {
            text: el.textContent,
            x: rect.left - paper.left,
            right: rect.right - paper.left,
            top: el.getBoundingClientRect().top - paper.top,
          };
        }),
      };
    });
  expect(positions.width).toBe(856);
  const result = await page.evaluate(async (project) => {
    const { exportPDF } = await import("/src/exports.js");
    const { exportTYT, readTYT } = await import("/src/tyt-format.js");
    const restored = readTYT(await (await exportTYT(project)).text());
    const pdfjs = await import("/node_modules/.vite/deps/pdfjs-dist.js");
    pdfjs.GlobalWorkerOptions.workerSrc =
      "/node_modules/pdfjs-dist/build/pdf.worker.min.mjs";
    const parse = async (blob) => {
      const task = pdfjs.getDocument({
        data: new Uint8Array(await blob.arrayBuffer()),
        isEvalSupported: false,
      });
      const pdf = await task.promise;
      const first = await pdf.getPage(1);
      const viewport = first.getViewport({ scale: 1 });
      const segments = (await first.getTextContent()).items
        .filter((item) => item.str && !/^\d+$/.test(item.str))
        .map((item) => ({
          text: item.str,
          x: item.transform[4],
          y: viewport.height - item.transform[5],
          width: item.width,
          fontHeight: item.height,
        }));
      const data = segments.reduce((lines, item) => {
        const previous = lines.at(-1);
        if (previous && Math.abs(previous.y - item.y) < 0.01) {
          previous.text += item.text;
          previous.width = item.x + item.width - previous.x;
          previous.fontHeight = Math.max(previous.fontHeight, item.fontHeight);
        } else lines.push({ ...item });
        return lines;
      }, []);
      const previews = [],
        pageGeometry = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const canvas = document.createElement("canvas");
        const renderView = page.getViewport({ scale: 1.5 });
        canvas.width = renderView.width;
        canvas.height = renderView.height;
        await page.render({
          canvasContext: canvas.getContext("2d"),
          viewport: renderView,
        }).promise;
        previews.push(canvas.toDataURL());
        const items = (await page.getTextContent()).items.filter(
          (item) => item.height > 9,
        );
        pageGeometry.push({
          text: items.map((item) => item.str).join(" "),
          top: Math.min(
            ...items.map((item) => viewport.height - item.transform[5]),
          ),
          bottom: Math.max(
            ...items.map((item) => viewport.height - item.transform[5]),
          ),
          left: Math.min(...items.map((item) => item.transform[4])),
          right: Math.max(
            ...items.map((item) => item.transform[4] + item.width),
          ),
        });
      }
      const pages = pdf.numPages;
      await task.destroy();
      return {
        width: viewport.width,
        height: viewport.height,
        data,
        pages,
        previews,
        pageGeometry,
      };
    };
    const regular = await parse(await exportPDF(restored));
    const larger = await parse(
      await exportPDF({
        ...restored,
        metadata: { fontSize: 18, fontFamily: "georgia" },
      }),
    );
    return { regular, larger };
  }, project);
  expect(result.regular.width).toBe(642);
  expect(result.regular.height).toBe(792);
  expect(result.regular.pages).toBeGreaterThan(2);
  expect(result.larger.width).toBe(642);
  expect(result.larger.height).toBe(1188);
  expect(result.larger.data[0].fontHeight).toBeCloseTo(18, 0);
  const { writeFile } = await import("node:fs/promises");
  for (const [name, value] of Object.entries(result)) {
    for (let i = 0; i < value.previews.length; i++)
      await writeFile(
        info.outputPath(`pdf-${name}-${i + 1}.png`),
        Buffer.from(value.previews[i].split(",")[1], "base64"),
      );
    for (const page of value.pageGeometry) {
      expect(page.left).toBeGreaterThanOrEqual(77.9);
      expect(page.right).toBeLessThanOrEqual(570.1);
      expect(page.top).toBeGreaterThanOrEqual(name === "regular" ? 66 : 99);
      expect(page.bottom).toBeLessThanOrEqual(name === "regular" ? 726 : 1089);
    }
    expect(value.pageGeometry.at(-1).text).toContain("47.");
  }
  for (let i = 0; i < positions.blocks.length; i++) {
    const block = positions.blocks[i];
    const item = result.regular.data.find((item) => item.text === block.text);
    expect(item, block.text).toBeTruthy();
    expect(item.x).toBeCloseTo(block.x * 0.75, 0);
    expect(item.x + item.width).toBeCloseTo(block.right * 0.75, 0);
  }
  const action = result.regular.data.find(
    (item) => item.text === positions.blocks[1].text,
  );
  const plain = result.regular.data.find(
    (item) => item.text === positions.blocks[6].text,
  );
  expect(plain.y - action.y).toBeCloseTo(
    (positions.blocks[6].top - positions.blocks[1].top) * 0.75,
    0,
  );
});

test("scene numbers grow with their digits and keep a 16px gap to their outline icon", async ({
  page,
}) => {
  const project = createProject("Нумерация сцен");
  project.content.content = Array.from({ length: 101 }, (_, i) =>
    paragraph("scene", `ИНТ. СЦЕНА ${i + 1} — ДЕНЬ`, `scene-${i + 1}`),
  );
  project.outline = {
    columns: [{ id: "act", title: "Акт" }],
    cards: [9, 10, 100, 101].map((number) => ({
      id: `card-${number}`,
      columnId: "act",
      title: `Сцена ${number}`,
      blockId: `scene-${number}`,
      text: "",
      drama: 0,
    })),
  };
  await open(page, project);
  const metrics = await page
    .locator(".scene-gutter:has(.outline-scene-link)")
    .evaluateAll((elements) =>
      elements.map((el) => {
        const number = el.querySelector(".scene-number");
        const rect = number.getBoundingClientRect();
        const icon = el.querySelector("button").getBoundingClientRect();
        const paper = el.closest(".script-paper").getBoundingClientRect();
        return {
          value: number.dataset.number,
          width: rect.width,
          left: rect.left - paper.left,
          gap: icon.left - rect.right,
          iconWidth: icon.width,
        };
      }),
    );
  expect(metrics.map((item) => item.value)).toEqual(["9", "10", "100", "101"]);
  expect(metrics[0].width).toBeLessThan(metrics[1].width);
  expect(metrics[1].width).toBeLessThan(metrics[2].width);
  for (const item of metrics) {
    expect(item.left).toBe(16);
    expect(item.gap).toBe(16);
    expect(item.iconWidth).toBe(34);
  }
});

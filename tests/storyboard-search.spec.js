import { test, expect } from "@playwright/test";
import { createProject } from "../src/data.js";
import { grantPro } from "./helpers/pro-access.js";

const paragraph = (format, text, blockId) => ({
  type: "paragraph",
  attrs: { format, blockId },
  ...(text ? { content: [{ type: "text", text }] } : {}),
});
async function open(page) {
  await grantPro(page);
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  const doc = createProject("Поиск раскадровки");
  doc.content.content = [
    paragraph("scene", "", "unnamed"),
    paragraph("action", "Лампа на столе.", "lamp"),
    paragraph("scene", "ИНТ. КОМНАТА — НОЧЬ", "room"),
    paragraph("action", "Тишина.", "quiet"),
  ];
  doc.sceneShots = {
    unnamed: {
      A: {
        frames: Array.from({ length: 65 }, (_, index) => ({
          id: `empty-${index}`,
          image: "",
          durationMs: 5000,
          transition: "cut",
          layers: [
            {
              id: `ink-${index}`,
              name: "Контур",
              type: "rectangle",
              points: [
                [0.1, 0.1],
                [0.9, 0.9],
              ],
              color: "#222222",
              width: 3,
              visible: true,
            },
          ],
        })),
      },
    },
    room: {
      A: {
        frames: [
          {
            id: "comment-frame",
            image: "",
            durationMs: 5000,
            transition: "cut",
            comments: [
              { id: "note", x: 0.5, y: 0.5, text: "Тайный маяк", replies: [] },
            ],
          },
        ],
      },
    },
  };
  doc.sceneVariants = {
    room: { B: [paragraph("scene", "ИНТ. КОМНАТА — РАССВЕТ", "room")] },
  };
  doc.sceneShots.room.B = {
    frameComment: "Архивный янтарь",
    frames: [
      {
        id: "alternative-frame",
        image: "",
        durationMs: 5000,
        transition: "cut",
      },
    ],
  };
  await page.addInitScript((doc) => {
    localStorage.setItem("tyter.projects.v1", JSON.stringify([doc]));
    localStorage.setItem("tyter.active", doc.id);
    localStorage.setItem("tyter.onboarding.v1", "done");
    localStorage.setItem("tyter.editor-intro.v1", "seen");
    localStorage.setItem("tyter.language.v1", "ru");
  }, doc);
  await page.goto("/beta");
  await expect(page.locator(".screenplay-editor")).toBeVisible();
  await page.keyboard.press("Control+f");
  await expect(page.locator(".search-drawer")).toBeVisible();
}

test("unnamed storyboard frames show bounded cards with drawings and open their existing frame", async ({
  page,
}) => {
  await open(page);
  await page
    .locator(".search-drawer")
    .getByRole("button", { name: "Раскадровка", exact: true })
    .click();
  await page
    .getByLabel("Поиск по раскадровке", { exact: true })
    .fill("Без названия");
  const cards = page.locator(".storyboard-search__card");
  await expect(cards).toHaveCount(60);
  await expect(
    cards.first().locator(".storyboard-search__drawing rect"),
  ).toHaveCount(1);
  await expect(cards.first()).toContainText("Стр. 1 · Сцена 1 A · Кадр 1");
  await page.getByRole("button", { name: /Показать ещё/ }).click();
  await expect(cards).toHaveCount(65);
  await cards.last().click();
  await expect(page.locator(".story-frame-workspace")).toBeVisible();
  await expect(page.locator(".story-frame-workspace__header")).toContainText(
    "1 A · 65",
  );
});

test("scope switching preserves scenario search and frame comments navigate to their owner", async ({
  page,
}) => {
  await open(page);
  const drawer = page.locator(".search-drawer");
  await page.getByLabel("Поиск по тексту", { exact: true }).fill("лампа");
  await expect(page.locator(".search-result-card")).toHaveCount(1);
  await drawer
    .getByRole("button", { name: "Раскадровка", exact: true })
    .click();
  await expect(
    page.getByLabel("Поиск по раскадровке", { exact: true }),
  ).toHaveValue("лампа");
  await expect(page.locator(".storyboard-search__card")).toHaveCount(0);
  await drawer.getByRole("button", { name: "Сценарий", exact: true }).click();
  await expect(page.locator(".search-result-card")).toHaveCount(1);
  await drawer
    .getByRole("button", { name: "Раскадровка", exact: true })
    .click();
  await page.getByLabel("Поиск по раскадровке", { exact: true }).fill("маяк");
  const result = page.locator(".storyboard-search__card");
  await expect(result).toHaveCount(1);
  await expect(result.locator("mark")).toHaveText("маяк");
  await expect(result).toHaveAttribute("data-frame-id", "comment-frame");
  await result.click();
  await expect(page.locator(".story-frame-workspace__header")).toContainText(
    "2 A · 1",
  );
});

test("opening an inactive scene alternative searches its saved frames and selects that alternative", async ({
  page,
}) => {
  await open(page);
  await page
    .locator(".search-drawer")
    .getByRole("button", { name: "Раскадровка", exact: true })
    .click();
  await page.getByLabel("Поиск по раскадровке", { exact: true }).fill("янтарь");
  const card = page.locator(".storyboard-search__card");
  await expect(card).toHaveCount(1);
  await expect(card).toHaveAttribute("data-scene-variant", "B");
  await expect(card).toHaveAttribute("data-frame-id", "alternative-frame");
  await card.click();
  await expect(page.locator(".story-frame-workspace__header")).toContainText(
    "2 B · 1",
  );
});

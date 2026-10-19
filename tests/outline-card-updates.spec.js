import { test, expect } from "@playwright/test";
import { createProject } from "../src/data.js";
import { grantPro } from "./helpers/pro-access.js";

const p = (format, text, blockId, sceneVariant) => ({
  type: "paragraph",
  attrs: { format, blockId, ...(sceneVariant ? { sceneVariant } : {}) },
  ...(text ? { content: [{ type: "text", text }] } : {}),
});
async function open(
  page,
  { theme = "light", width = 1440, errors = false } = {},
) {
  await page.setViewportSize({ width, height: width < 832 ? 844 : 1000 });
  await grantPro(page);
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  const doc = createProject("Карточки и варианты");
  doc.id = "outline-card-updates";
  doc.content.content = [
    p("scene", "ИНТ. ДОМ — ДЕНЬ", "scene", "F"),
    p("action", "Анна входит в дом.", "action"),
    p("character", "АННА", "anna"),
    p("speech", "Я дома.", "speech"),
    p("scene", "ЭКС. САД — НОЧЬ", "garden", "B"),
    p("character", "БОРИС", "boris"),
    p("speech", "А я в саду.", "speech-2"),
  ];
  if (errors)
    doc.content.content.push(
      ...Array.from({ length: 8 }, (_, i) =>
        p("scene", `МЕСТО ${i}`, `bad-${i}`),
      ),
    );
  doc.outline = {
    columns: [
      { id: "act", title: "Акт 1" },
      { id: "act-2", title: "Акт 2", collapsed: true },
    ],
    cards: [
      {
        id: "card",
        columnId: "act",
        blockId: "scene",
        title: "Встреча",
        text: "Текст карточки.",
        color: "#609923",
        drama: 3,
        comments: [],
      },
      {
        id: "garden-card",
        columnId: "act-2",
        blockId: "garden",
        title: "Сад",
        text: "Ночная сцена.",
        color: "#609923",
        drama: 5,
        comments: [],
      },
    ],
  };
  doc.notes = {
    content: {
      type: "doc",
      content: [p("plain", "Сохранённая заметка.", "note")],
    },
    comments: [],
  };
  await page.addInitScript(
    ({ doc, theme, errors }) => {
      if (sessionStorage.getItem("card-updates-seeded")) return;
      sessionStorage.setItem("card-updates-seeded", "yes");
      localStorage.setItem("tyter.projects.v1", JSON.stringify([doc]));
      localStorage.setItem("tyter.active", doc.id);
      localStorage.setItem("tyter.language.v1", "ru");
      localStorage.setItem(
        "tyter.editor-preferences.v1",
        JSON.stringify({ theme, doctorFlies: true }),
      );
      if (errors)
        localStorage.setItem(
          "tyter.writing-timer.v1",
          JSON.stringify({
            coins: 0,
            session: null,
            purchases: {
              "script-doctor": { purchasedAt: Date.now(), cost: 20 },
            },
          }),
        );
    },
    { doc, theme, errors },
  );
  await page.goto("/beta");
  await expect(page.locator(".screenplay-editor")).toBeVisible();
}
const cardDrawer = (page) =>
  page.getByRole("complementary", {
    name: "Редактирование карточки",
    exact: true,
  });
const view = (page, name) =>
  page
    .getByRole("group", { name: "Режим документа" })
    .getByRole("button", { name, exact: true });
const cardLink = (page, title = "Встреча") =>
  page.getByRole("button", { name: `Открыть карточку ${title}`, exact: true });
async function stored(page) {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("tyter.local-files.v1", 1);
        open.onsuccess = () => {
          const db = open.result,
            request = db
              .transaction("files")
              .objectStore("files")
              .get("documents");
          request.onsuccess = () => {
            resolve(
              request.result?.find((doc) => doc.id === "outline-card-updates"),
            );
            db.close();
          };
          request.onerror = () => reject(request.error);
        };
        open.onerror = () => reject(open.error);
      }),
  );
}
test("dialogue cards show the scene variant beside the number and title", async ({
  page,
}, info) => {
  await open(page);
  await page
    .getByRole("button", { name: "Реплики персонажей", exact: true })
    .click();
  await expect(page.locator(".character-dialogue-variant")).toHaveText([
    "Вариант F",
    "Вариант B",
  ]);
  await expect(page.locator(".character-dialogue-scene").first()).toContainText(
    "1. ИНТ. ДОМ — ДЕНЬ",
  );
  await page.screenshot({ path: info.outputPath("dialogue-variants.png") });
});
test("flies crawl in short steps outside the icon, keep the limit and can be disabled", async ({
  page,
}) => {
  await open(page, { errors: true });
  const flies = page.locator(".doctor-interface-fly");
  await expect(flies).toHaveCount(12);
  await expect(page.locator(".script-doctor-icon .doctor-fly")).toHaveCount(0);
  await expect(flies.first()).toHaveAttribute("data-movement", "crawl");
  await expect
    .poll(() => flies.first().evaluate((node) => node.getAnimations().length))
    .toBeGreaterThan(0);
  const motion = await flies.first().evaluate((node) => {
    const frames = node.getAnimations()[0].effect.getKeyframes();
    const first = new DOMMatrixReadOnly(frames[0].transform),
      last = new DOMMatrixReadOnly(frames.at(-1).transform);
    return {
      frames: frames.length,
      distance: Math.hypot(first.m41 - last.m41, first.m42 - last.m42),
      pointer: getComputedStyle(node).pointerEvents,
    };
  });
  expect(motion.frames).toBe(2);
  expect(motion.distance).toBeLessThanOrEqual(36.01);
  expect(motion.pointer).toBe("none");
  await page
    .getByRole("button", { name: "Доктор сценария", exact: true })
    .click();
  await page
    .getByRole("switch", { name: "Визуализация мух", exact: true })
    .uncheck();
  await expect(flies).toHaveCount(0);
  await expect(page.locator(".doctor-finding").first()).toBeVisible();
  await page.reload();
  await expect(flies).toHaveCount(0);
});

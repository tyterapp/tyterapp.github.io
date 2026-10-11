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
    ({ doc, theme }) => {
      if (sessionStorage.getItem("card-updates-seeded")) return;
      sessionStorage.setItem("card-updates-seeded", "yes");
      localStorage.setItem("tyter.projects.v1", JSON.stringify([doc]));
      localStorage.setItem("tyter.active", doc.id);
      localStorage.setItem("tyter.language.v1", "ru");
      localStorage.setItem(
        "tyter.editor-preferences.v1",
        JSON.stringify({ theme, doctorFlies: true }),
      );
    },
    { doc, theme },
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
for (const theme of ["light", "dark"]) {
  test(`${theme}: screenplay opens a resizable card at the right and target goes to outline`, async ({
    page,
  }, info) => {
    await open(page, { theme });
    await cardLink(page).click();
    const drawer = cardDrawer(page);
    await expect(drawer).toBeVisible();
    await expect(view(page, "Сценарий")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const rect = await drawer.boundingBox();
    expect(rect.width).toBe(340);
    expect(rect.x + rect.width).toBe(1440);
    const grip = drawer.getByRole("separator", { name: "Ширина карточки" });
    const handle = await grip.boundingBox();
    await page.mouse.move(
      handle.x + handle.width / 2,
      handle.y + handle.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(handle.x - 250, handle.y + handle.height / 2, {
      steps: 12,
    });
    await page.mouse.up();
    await expect(grip).toHaveAttribute("aria-valuenow", "480");
    expect((await drawer.boundingBox()).width).toBe(480);
    await grip.focus();
    await page.keyboard.press("ArrowRight");
    await expect(grip).toHaveAttribute("aria-valuenow", "460");
    await page.keyboard.press("End");
    await drawer
      .getByRole("textbox", { name: "Название карточки", exact: true })
      .fill("Новая встреча");
    await drawer
      .getByRole("textbox", { name: "Текст карточки", exact: true })
      .fill("Обновлённый текст карточки.");
    await expect(page.locator('[data-block-id="action"]')).toContainText(
      "Анна входит в дом.",
    );
    await expect
      .poll(async () => (await stored(page))?.outline.cards[0].text)
      .toBe("Обновлённый текст карточки.");
    await page.screenshot({ path: info.outputPath("screenplay-card-480.png") });
    await drawer
      .getByRole("button", {
        name: "Перейти к карточке в аутлайне",
        exact: true,
      })
      .click();
    await expect(view(page, "Аутлайн")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('[data-card-id="card"]')).toHaveClass(/selected/);
    expect((await cardDrawer(page).boundingBox()).width).toBe(480);
    await expect(
      cardDrawer(page).getByRole("textbox", {
        name: "Название карточки",
        exact: true,
      }),
    ).toHaveValue("Новая встреча");
    await page.reload();
    await cardLink(page, "Новая встреча").click();
    expect((await cardDrawer(page).boundingBox()).width).toBe(480);
    await page.keyboard.press("Escape");
    await expect(cardDrawer(page)).toHaveCount(0);
  });
}
test("outline target opens a collapsed act and locates the selected card", async ({
  page,
}) => {
  await open(page);
  await cardLink(page, "Сад").click();
  await cardDrawer(page)
    .getByRole("button", { name: "Перейти к карточке в аутлайне", exact: true })
    .click();
  await expect(page.locator('[data-column-id="act-2"]')).not.toHaveClass(
    /is-collapsed/,
  );
  await expect(page.locator('[data-card-id="garden-card"]')).toBeInViewport();
  await expect(page.locator('[data-card-id="garden-card"]')).toHaveClass(
    /selected/,
  );
});
test("supplied icons share the interface stroke and paused items preserve notes", async ({
  page,
}) => {
  await open(page);
  await expect(cardLink(page).locator("svg")).toHaveAttribute(
    "viewBox",
    "0 0 32 32",
  );
  await expect(view(page, "Аутлайн").locator("svg")).toHaveAttribute(
    "viewBox",
    "0 0 32 32",
  );
  await expect(cardLink(page).locator("svg")).toHaveAttribute(
    "stroke",
    "currentColor",
  );
  await expect(view(page, "Аутлайн").locator("svg")).toHaveAttribute(
    "stroke",
    "currentColor",
  );
  await expect(
    page.getByRole("button", { name: "Задания", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "Версии сценария", exact: true })
    .click();
  const versions = page.getByRole("listbox", {
    name: "Версии сценария",
    exact: true,
  });
  await expect(versions.getByRole("option")).toHaveCount(9);
  await expect(
    versions.getByRole("option", { name: "Note", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect
    .poll(
      async () =>
        (await stored(page))?.notes.content.content[0].content[0].text,
    )
    .toBe("Сохранённая заметка.");
});
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
test("320px: screenplay card opens in a sheet and target goes to outline", async ({
  page,
}, info) => {
  await open(page, { width: 320 });
  await cardLink(page).click();
  await expect(view(page, "Сценарий")).toHaveAttribute("aria-pressed", "true");
  const drawer = cardDrawer(page);
  await expect(drawer).toBeVisible();
  expect((await drawer.boundingBox()).width).toBeLessThanOrEqual(320);
  await expect(drawer.getByRole("separator")).toBeHidden();
  await expect(drawer.locator("input.app-range")).toHaveCSS(
    "appearance",
    "none",
  );
  await expect(drawer.locator("input.app-range")).toHaveCSS("height", "4px");
  await page.screenshot({ path: info.outputPath("mobile-card.png") });
  await drawer
    .getByRole("button", { name: "Перейти к карточке в аутлайне", exact: true })
    .click();
  await expect(view(page, "Аутлайн")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-card-id="card"]')).toHaveClass(/selected/);
});

import { openWritingShop } from "./helpers/writing-shop.js";
import { test, expect } from "@playwright/test";
import { createProject } from "../src/data.js";
import {
  cleanWalletExtras,
  purchaseWalletLighter,
  recordWalletBurn,
  resetWalletProgress,
} from "../src/writing-wallet.js";
import { grantPro } from "./helpers/pro-access.js";
import { scriptVersionSnapshot } from "../src/script-versions.js";
import { selectAppOption } from "./helpers/app-select.js";

const paragraph = (id, format, text, marks) => ({
  type: "paragraph",
  attrs: { blockId: id, format, sceneVariant: null },
  content: text
    ? [{ type: "text", text, ...(marks ? { marks } : {}) }]
    : undefined,
});
function documentFixture(long = false) {
  const doc = createProject("Страницы для сжигания");
  doc.content = {
    type: "doc",
    content: long
      ? [
          paragraph("heading", "scene", "ИНТ. КОМНАТА — ДЕНЬ"),
          {
            ...paragraph("long", "action", "Сохраняем начало. "),
            content: [
              {
                type: "text",
                text: "Сохраняем начало. ",
                marks: [{ type: "bold" }],
              },
              {
                type: "text",
                text: "Длинный текст истории с кошкой и двумя друзьями. ".repeat(
                  180,
                ),
                marks: [{ type: "italic" }],
              },
            ],
          },
        ]
      : Array.from({ length: 80 }, (_, index) =>
          paragraph(
            `scene-${index}`,
            "scene",
            `НЕВЕРНЫЙ ЗАГОЛОВОК ${index + 1}`,
          ),
        ),
  };
  return doc;
}
async function open(
  page,
  {
    width = 1440,
    theme = "light",
    doc = documentFixture(),
    coins = 50,
    owned = false,
    flies = true,
    reduced = false,
    fallback = false,
  } = {},
) {
  await page.setViewportSize({ width, height: width < 832 ? 844 : 1000 });
  if (reduced) await page.emulateMedia({ reducedMotion: "reduce" });
  await grantPro(page);
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  await page.addInitScript(
    ({ doc, coins, owned, flies, theme, fallback }) => {
      if (localStorage.getItem("tyter.lighter-test-seeded")) return;
      localStorage.setItem("tyter.lighter-test-seeded", "1");
      const date = new Date(),
        day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      localStorage.setItem("tyter.projects.v1", JSON.stringify([doc]));
      localStorage.setItem("tyter.active", doc.id);
      localStorage.setItem("tyter.language.v1", "ru");
      localStorage.setItem(
        "tyter.editor-preferences.v1",
        JSON.stringify({ theme, doctorFlies: flies }),
      );
      localStorage.setItem(
        "tyter.writing-timer.v1",
        JSON.stringify({
          coins,
          session: null,
          streak: { day, count: 1, best: 1 },
          purchases: {
            "script-doctor": { purchasedAt: Date.now(), cost: 20 },
            ...(owned
              ? { "paper-lighter": { purchasedAt: Date.now(), cost: 50 } }
              : {}),
          },
        }),
      );
      if (fallback) {
        const get = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, ...args) {
          return type === "webgl" ? null : get.call(this, type, ...args);
        };
      }
    },
    { doc, coins, owned, flies, theme, fallback },
  );
  await page.goto("/beta");
  await page.bringToFront();
  await expect(page.locator(".screenplay-editor")).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator(".screenplay-editor")
        .evaluate((element) => element.editor?.getJSON().content.length),
    )
    .toBe(doc.content.content.length);
}
const burn = (page) =>
  page.getByRole("button", { name: "Сжечь последнюю страницу", exact: true });
const wallet = (page) =>
  page.evaluate(() =>
    JSON.parse(localStorage.getItem("tyter.writing-timer.v1")),
  );
const json = (page) =>
  page
    .locator(".screenplay-editor")
    .evaluate((element) => element.editor.getJSON());
async function openMisc(page) {
  await expect(page.locator(".screenplay-editor")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const shop = page.locator("#writing-shop");
  if (!(await shop.count())) await openWritingShop(page);
  const category = shop.getByRole("button", {
    name: /^(Разное|Miscellaneous)$/,
  });
  if (await category.count()) await category.click();
  await expect(shop.locator(".writing-shop-header > strong")).toHaveText(
    /^(Разное|Miscellaneous)$/,
  );
}
async function useLighter(page) {
  await openMisc(page);
  await burn(page).click();
}
async function buy(page) {
  await openWritingShop(page);
  await expect(page.locator("#writing-shop")).not.toContainText("Зажигалка");
  await openMisc(page);
  await page
    .getByRole("button", { name: "Купить зажигалку за 50 монет", exact: true })
    .click();
  await expect(burn(page)).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Купить зажигалку за 50 монет",
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Закрыть магазин", exact: true })
    .click();
  await expect(page.locator("#writing-shop")).toHaveCount(0);
  await expect(
    page.locator(
      '.writing-timer > button[aria-label="Сжечь последнюю страницу"]',
    ),
  ).toHaveCount(0);
}

test("lighter costs 50 once, persists through wallet cleaning, and its achievement and ownership reset with progress", () => {
  const initial = { coins: 49, session: null };
  expect(purchaseWalletLighter(initial).ok).toBe(false);
  expect(initial.coins).toBe(49);
  const purchased = purchaseWalletLighter({ coins: 250, session: null }, 1000);
  expect(purchased.wallet.coins).toBe(200);
  expect(purchaseWalletLighter(purchased.wallet, 2000).wallet).toBe(
    purchased.wallet,
  );
  expect(recordWalletBurn(initial).ok).toBe(false);
  const earned = recordWalletBurn(purchased.wallet);
  expect(earned.unlocked).toBe(true);
  expect(earned.wallet.coins).toBe(200);
  expect(recordWalletBurn(earned.wallet).unlocked).toBe(false);
  expect(cleanWalletExtras(earned.wallet).purchases["paper-lighter"].cost).toBe(
    50,
  );
  expect(
    cleanWalletExtras(earned.wallet).achievements["burn-after-reading"].name,
  ).toBe("После прочтения сжечь");
  const reset = resetWalletProgress(earned.wallet);
  expect(reset.wallet.coins).toBe(0);
  expect(reset.wallet.purchases).toBeUndefined();
  expect(reset.wallet.achievements).toBeUndefined();
});

async function completeBurn(page) {
  await expect(page.locator(".burning-paper-layer")).toHaveCount(0, {
    timeout: 7000,
  });
  await expect(page.locator(".script-paper")).toHaveCSS("mask-image", "none");
  await expect(page.getByRole("alert")).toHaveCount(0);
}

test("purchase burns only the last rendered page with WebGL, hides flies then restores them gradually, and supports repeat use and undo", async ({
  page,
}, info) => {
  test.setTimeout(60000);
  await open(page);
  await expect(page.locator(".doctor-interface-fly")).toHaveCount(12);
  await buy(page);
  await openMisc(page);
  await page.screenshot({ path: info.outputPath("misc-lighter-owned.png") });
  expect((await wallet(page)).coins).toBe(0);
  const before = await json(page);
  const keep = await page.locator(".screenplay-editor").evaluate((element) => {
    const paper = element.closest(".script-paper"),
      rect = paper.getBoundingClientRect(),
      scale = rect.width / paper.offsetWidth;
    const pages = paper.querySelectorAll(".page-guide").length;
    const height =
      parseFloat(getComputedStyle(paper).getPropertyValue("--page-margin")) *
      12;
    const boundary = rect.top + (pages - 1) * height * scale;
    return [...element.querySelectorAll("p")].filter((p) => {
      const text = [...p.childNodes].find(
        (node) => node.nodeType === Node.TEXT_NODE,
      );
      const range = document.createRange();
      range.selectNodeContents(text);
      return range.getBoundingClientRect().top < boundary;
    }).length;
  });
  expect(keep).toBeGreaterThan(0);
  expect(keep).toBeLessThan(before.content.length);
  await useLighter(page);
  const overlay = page.locator(".burning-paper-layer");
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveAttribute("data-renderer", "webgl");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await json(page)).toEqual(before);
  const geometry = await page
    .locator(".burning-paper-canvas")
    .evaluate((canvas) => {
      const paper = document.querySelector(".script-paper"),
        a = canvas.getBoundingClientRect(),
        b = paper.getBoundingClientRect();
      return {
        x: a.x,
        width: a.width,
        right: a.right,
        bottom: a.bottom,
        paperX: b.x,
        paperWidth: b.width,
        paperRight: b.right,
        paperBottom: b.bottom,
      };
    });
  expect(geometry.x).toBeCloseTo(geometry.paperX, 0);
  expect(geometry.width).toBeCloseTo(geometry.paperWidth, 0);
  expect(geometry.bottom).toBeCloseTo(geometry.paperBottom, 0);
  await expect(page.locator(".doctor-interface-fly")).toHaveCount(0);
  await page.waitForTimeout(700);
  await page.screenshot({ path: info.outputPath("burning-page.png") });
  await expect(overlay).toHaveCount(0);
  const after = await json(page);
  expect(after.content).toEqual(before.content.slice(0, keep));
  const snapshots = await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const opening = indexedDB.open("tyter.history.v1", 1);
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const db = opening.result,
            request = db
              .transaction("revisions")
              .objectStore("revisions")
              .getAll();
          request.onsuccess = () => {
            resolve(
              request.result
                .filter(
                  (entry) => entry.label === "До сжигания последней страницы",
                )
                .map((entry) => entry.snapshot.content),
            );
            db.close();
          };
          request.onerror = () => {
            reject(request.error);
            db.close();
          };
        };
      }),
  );
  expect(snapshots).toEqual([before]);
  const result = await wallet(page);
  expect(result.coins).toBe(0);
  expect(result.achievements["burn-after-reading"].name).toBe(
    "После прочтения сжечь",
  );
  await expect(page.locator(".doctor-interface-fly")).toHaveCount(0);
  await expect(page.locator(".doctor-interface-fly")).toHaveCount(1, {
    timeout: 4200,
  });
  await useLighter(page);
  await expect(page.locator(".doctor-interface-fly")).toHaveCount(0);
  await expect(overlay).toHaveCount(0);
  expect((await wallet(page)).coins).toBe(0);
  await page.locator(".screenplay-editor").press("Control+z");
  expect(await json(page)).toEqual(after);
  await page.locator(".screenplay-editor").press("Control+z");
  expect(await json(page)).toEqual(before);
  await page.clock.install();
  await page.clock.fastForward(40000);
  await expect(page.locator(".doctor-interface-fly")).toHaveCount(12);
  await page.reload();
  await openMisc(page);
  await expect(burn(page)).toBeVisible();
});

test("burning a partial last page in a long paragraph preserves its prefix, marks, block id, and exact undo", async ({
  page,
}, info) => {
  await open(page, {
    owned: true,
    doc: documentFixture(true),
    flies: false,
    theme: "dark",
  });
  await expect
    .poll(() => page.locator(".screenplay-page-break").count())
    .toBeGreaterThan(1);
  const before = await json(page);
  const beforeText = before.content[1].content
    .map((node) => node.text)
    .join("");
  await page
    .getByRole("button", { name: "Открыть таймер", exact: true })
    .click();
  await page.getByRole("button", { name: "5 мин", exact: true }).click();
  const session = (await wallet(page)).session;
  await page.context().setOffline(true);
  await useLighter(page);
  await expect(page.locator(".burning-paper-layer")).toBeVisible();
  await page.waitForTimeout(800);
  await page.screenshot({ path: info.outputPath("burning-page-dark.png") });
  await completeBurn(page);
  const after = await json(page);
  const afterText = after.content[1].content.map((node) => node.text).join("");
  expect(afterText.length).toBeGreaterThan(0);
  expect(afterText.length).toBeLessThan(beforeText.length);
  expect(beforeText.startsWith(afterText)).toBe(true);
  expect(after.content[0]).toEqual(before.content[0]);
  expect(after.content[1].attrs).toEqual(before.content[1].attrs);
  expect(after.content[1].content[0]).toEqual(before.content[1].content[0]);
  expect(after.content[1].content[1].marks).toEqual(
    before.content[1].content[1].marks,
  );
  expect((await wallet(page)).session.id).toBe(session.id);
  expect((await wallet(page)).coins).toBe(50);
  await page.locator(".screenplay-editor").press("Control+z");
  expect(await json(page)).toEqual(before);
  await page.waitForTimeout(3400);
  await expect(page.locator(".doctor-interface-fly")).toHaveCount(0);
});

for (const [width, options] of [
  [320, { fallback: true }],
  [832, { reduced: true }],
]) {
  test(`burn works at ${width}px with ${options.fallback ? "WebGL unavailable" : "reduced motion"}; empty document is safe`, async ({
    page,
  }, info) => {
    await open(page, {
      width,
      ...options,
      owned: true,
      doc: documentFixture(true),
      flies: false,
    });
    await openMisc(page);
    await page.screenshot({ path: info.outputPath("misc-lighter-mobile.png") });
    const before = await json(page);
    await useLighter(page);
    const overlay = page.locator(".burning-paper-layer");
    await expect(overlay).toHaveAttribute(
      "data-renderer",
      options.fallback ? "fallback" : "reduced-motion",
    );
    if (options.fallback) {
      const bounds = await overlay.locator("canvas").boundingBox();
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    }
    await expect(overlay).toHaveCount(0);
    const after = await json(page);
    expect(
      after.content[1].content.map((n) => n.text).join("").length,
    ).toBeLessThan(
      before.content[1].content.map((n) => n.text).join("").length,
    );
    await page.locator(".screenplay-editor").press("Control+z");
    expect(await json(page)).toEqual(before);
    await page.locator(".screenplay-editor").evaluate((element) =>
      element.editor.commands.setContent({
        type: "doc",
        content: [{ type: "paragraph", attrs: { format: "scene" } }],
      }),
    );
    await useLighter(page);
    await completeBurn(page);
    expect((await json(page)).content.map((n) => n.attrs.format)).toEqual([
      "scene",
      "action",
    ]);
    expect((await wallet(page)).coins).toBe(50);
  });
}

test("single page is cleared, undo restores it, achievement appears once and English labels work", async ({
  page,
}) => {
  const doc = createProject("Одна страница");
  doc.content = {
    type: "doc",
    content: [
      paragraph("one", "scene", "ИНТ. КОМНАТА — ДЕНЬ"),
      paragraph("two", "action", "Кошка сидит у окна."),
    ],
  };
  await open(page, { owned: true, doc, flies: false });
  const before = await json(page);
  await useLighter(page);
  await expect(page.locator(".burning-paper-layer")).toHaveAttribute(
    "data-phase",
    "dissolve",
    { timeout: 5000 },
  );
  await page.screenshot({ path: ".cache/burn-first-page-dissolve.png" });
  await completeBurn(page);
  expect((await json(page)).content.map((n) => n.attrs.format)).toEqual([
    "scene",
    "action",
  ]);
  expect(
    (await json(page)).content.every((node) => !node.content?.length),
  ).toBe(true);
  await page.locator(".screenplay-editor").press("Control+z");
  expect(await json(page)).toEqual(before);
  await page.getByRole("button", { name: "Монеты: 50", exact: true }).click();
  await page.getByRole("button", { name: "Достижения", exact: true }).click();
  const card = page
    .locator(".writing-coins-achievement")
    .filter({ hasText: "После прочтения сжечь" });
  await expect(card).toHaveAttribute("data-earned", "true");
  await expect(card).toContainText("Получено");
  await expect(card).not.toContainText("+10");
  await page
    .getByRole("button", { name: "Закрыть монеты", exact: true })
    .click();
  await page.getByRole("button", { name: "ENG", exact: true }).click();
  await openMisc(page);
  await expect(
    page.getByRole("button", { name: "Burn the last page", exact: true }),
  ).toBeVisible();
});

for (const [fontSize, documentZoom] of [
  [12, 200],
  [26, 130],
]) {
  test(`${fontSize}pt / ${documentZoom}%: mobile and desktop burn the same logical last page without touching another version`, async ({
    page,
  }) => {
    const doc = documentFixture(true);
    doc.metadata.fontSize = fontSize;
    doc.metadata.documentZoom = documentZoom;
    const other = createProject("Другая версия");
    other.content = {
      type: "doc",
      content: [
        paragraph("other", "action", "Текст другой версии должен сохраниться."),
      ],
    };
    doc.scriptVersions = { blue: scriptVersionSnapshot(other) };
    await open(page, { owned: true, flies: false, doc });
    await page.setViewportSize({ width: 2800, height: 1000 });
    const before = await json(page);
    await useLighter(page);
    await completeBurn(page);
    const desktop = await json(page);
    await page.locator(".screenplay-editor").press("Control+z");
    expect(await json(page)).toEqual(before);
    await page.setViewportSize({ width: 320, height: 844 });
    await useLighter(page);
    await completeBurn(page);
    expect((await json(page)).content[1].content[1].text.length).toEqual(
      desktop.content[1].content[1].text.length,
    );
    expect(await json(page)).toEqual(desktop);
    await selectAppOption(
      page,
      page.getByRole("combobox", { name: "Версии сценария" }),
      "blue",
    );
    expect(await json(page)).toEqual(other.content);
  });
}

test("flies stay gone when burning removes every finding, and the user's visibility preference is preserved", async ({
  page,
}) => {
  const doc = createProject("Ошибка на единственной странице");
  doc.content = {
    type: "doc",
    content: [paragraph("bad", "scene", "НЕВЕРНЫЙ ЗАГОЛОВОК")],
  };
  await open(page, { owned: true, doc });
  await expect(page.locator(".doctor-interface-fly")).toHaveCount(3);
  await useLighter(page);
  await completeBurn(page);
  await page.clock.install();
  await page.clock.fastForward(45000);
  await expect(page.locator(".doctor-interface-fly")).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("tyter.editor-preferences.v1"))
          .doctorFlies,
    ),
  ).toBe(true);
});

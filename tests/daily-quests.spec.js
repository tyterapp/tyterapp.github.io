import { test, expect } from "@playwright/test";
import { createProject } from "../src/data.js";
import {
  QUEST_LIBRARY,
  dailyQuestLibrary,
  continuationIdea,
  questDay,
} from "../src/pro/quests/library.js";
import {
  advanceWords,
  dailyProgress,
  finishQuest,
  questStatus,
  unlockedCards,
  PRO_QUEST_STORAGE,
} from "../src/pro/quests/progress.js";
import { WRITING_TIMER_STORAGE } from "../src/writing-timer.js";
import { grantPro } from "./helpers/pro-access.js";
import { selectAppOption } from "./helpers/app-select.js";

test.use({ timezoneId: "Europe/Moscow" });
const epoch = new Date("2026-10-10T09:00:00Z");
const p = (format, text, blockId) => ({
  type: "paragraph",
  attrs: { format, blockId },
  content: [{ type: "text", text }],
});
function fixture() {
  const doc = createProject("Моя история");
  doc.id = "daily-quest-document";
  doc.content.content = [
    p("scene", "ИНТ. ВОКЗАЛ — ДЕНЬ", "scene"),
    p(
      "action",
      Array.from({ length: 24 }, (_, i) => `слово${i}`).join(" "),
      "action",
    ),
    p("character", "АННА", "anna"),
    p("speech", "Поезд отправится через пять минут.", "speech"),
    p("character", "БОРИС", "boris"),
    p("speech", "Мы ещё успеем поговорить.", "reply"),
  ];
  return doc;
}
async function open(
  page,
  { pro = true, theme = "light", coins = 0, clock = false } = {},
) {
  if (pro) await grantPro(page);
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  await page.addInitScript(
    ({ doc, theme, coins }) => {
      localStorage.setItem("tyter.onboarding.v1", "done");
      if (sessionStorage.getItem("daily-quests-seeded")) return;
      localStorage.setItem("tyter.projects.v1", JSON.stringify([doc]));
      localStorage.setItem("tyter.active", doc.id);
      localStorage.setItem("tyter.language.v1", "ru");
      localStorage.setItem(
        "tyter.editor-preferences.v1",
        JSON.stringify({ theme }),
      );
      localStorage.setItem(
        "tyter.writing-timer.v1",
        JSON.stringify({
          coins,
          session: null,
          streak: {
            day: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`,
            count: 1,
            best: 1,
          },
        }),
      );
      sessionStorage.setItem("daily-quests-seeded", "yes");
    },
    { doc: fixture(), theme, coins },
  );
  if (clock) await page.clock.install({ time: epoch });
  await page.goto(pro ? "/beta" : "/free");
  await page.bringToFront();
  await expect(page.locator(".screenplay-editor")).toBeFocused();
  if (clock)
    await page.clock.pauseAt(
      new Date((await page.evaluate(() => Date.now())) + 1000),
    );
}
const wallet = (page) =>
  page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    WRITING_TIMER_STORAGE,
  );
const progress = (page, scope = "daily-quest-document") =>
  page.evaluate(
    ({ key, scope }) => JSON.parse(localStorage.getItem(key))?.scopes?.[scope],
    { key: PRO_QUEST_STORAGE, scope },
  );
const overlay = (page) =>
  page.getByRole("dialog", {
    name: "Карточки заданий на сегодня",
    exact: true,
  });
const currentCard = (page) => page.locator(".quest-card.is-current");
async function showCards(page) {
  if (await page.locator(".daily-quests-drawer").count())
    await page.getByRole("button", { name: "Карточки сегодня" }).click();
  else {
    await page.getByRole("button", { name: "Задания", exact: true }).click();
    if (!(await overlay(page).count()))
      await page.getByRole("button", { name: "Карточки сегодня" }).click();
  }
  await expect(overlay(page)).toBeVisible();
}
async function accept(page, minutes = 5) {
  await showCards(page);
  const id = await currentCard(page).getAttribute("data-card-id");
  await overlay(page)
    .getByRole("button", { name: `${minutes} мин`, exact: true })
    .click();
  await overlay(page)
    .getByRole("button", { name: "Принять задание", exact: true })
    .click();
  await expect(overlay(page)).toHaveCount(0);
  return id;
}
async function append(page, count) {
  await page.locator('p[data-block-id="action"]').evaluate((node) => {
    node.closest("[contenteditable]").focus();
    const range = document.createRange();
    range.selectNodeContents(node);
    range.collapse(false);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
  });
  await page.keyboard.insertText(
    " " + Array.from({ length: count }, (_, i) => `новое${i}`).join(" "),
  );
}

test("daily library contains the requested themes and context ideas, with stable daily ordering", () => {
  const deck = dailyQuestLibrary("one", "2026-10-10");
  expect(deck).toEqual(dailyQuestLibrary("one", "2026-10-10"));
  expect(deck.map((card) => card.id)).not.toEqual(
    dailyQuestLibrary("one", "2026-10-11").map((card) => card.id),
  );
  expect(new Set(deck.map((card) => card.theme))).toEqual(
    new Set(["animal", "journey", "parting", "hope"]),
  );
  expect(QUEST_LIBRARY.every((card) => card.goal === 100)).toBe(true);
  const doc = fixture(),
    before = JSON.stringify(doc);
  const idea = continuationIdea(doc, "2026-10-10");
  expect(idea).toContain("АННА");
  expect(idea).toContain("БОРИС");
  expect(idea).toContain("ВОКЗАЛ");
  expect(idea).toContain("Мы ещё успеем поговорить.");
  expect(idea).not.toBe(continuationIdea(doc, "2026-10-10", 1));
  expect(JSON.stringify(doc)).toBe(before);
});

test("progress excludes pauses, expired timers and undo farming, and manual completion is required", () => {
  const now = epoch.getTime(),
    day = questDay(now),
    scope = "one";
  const session = {
    id: "timer",
    status: "running",
    deadline: now + 300000,
    quest: { scope, day },
  };
  let record = dailyProgress(scope, now, {});
  record.active = { cardId: "animal", timerId: session.id, baseline: 0 };
  record = advanceWords(record, 100, session, scope, now);
  expect(unlockedCards(record, 8)).toBe(2);
  expect(record.completed).toEqual([]);
  record = advanceWords(record, -100, session, scope, now);
  expect(finishQuest(record, session, QUEST_LIBRARY[0], now).reason).toBe(
    "words",
  );
  record = advanceWords(record, 100, session, scope, now);
  expect(record.words).toBe(100);
  expect(
    advanceWords(record, 100, { ...session, status: "paused" }, scope, now),
  ).toEqual(record);
  expect(advanceWords(record, 100, session, "other", now)).toEqual(record);
  expect(advanceWords(record, 100, session, scope, session.deadline)).toEqual(
    record,
  );
  expect(
    finishQuest(record, session, QUEST_LIBRARY[0], session.deadline).reason,
  ).toBe("expired");
  const result = finishQuest(record, session, QUEST_LIBRARY[0], now);
  expect(result.ok).toBe(true);
  expect(result.record.completed).toEqual(["animal"]);
  expect(questStatus(record, null, now)).toBe("expired");
  const tomorrow = dailyProgress(scope, now + 86400000, { [scope]: record });
  expect(tomorrow.words).toBe(0);
  expect(tomorrow.active).toBeNull();
});

test("free edition offers Pro access without enabling the quest library", async ({
  page,
}) => {
  await open(page, { pro: false });
  await page.getByRole("button", { name: "Задания", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Полная версия Tyter" }),
  ).toBeVisible();
  await expect(overlay(page)).toHaveCount(0);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), PRO_QUEST_STORAGE),
  ).toBeNull();
});

for (const theme of ["light", "dark"]) {
  test(`collectible carousel covers the entire ${theme} UI and supports keyboard, wheel and touch`, async ({
    page,
  }, info) => {
    await open(page, { theme });
    await showCards(page);
    await expect(overlay(page)).toHaveCSS("z-index", "999");
    expect(await overlay(page).evaluate((node) => node.matches(":modal"))).toBe(
      true,
    );
    await expect(currentCard(page)).toHaveAttribute("data-unlocked", "true");
    const first = await currentCard(page).getAttribute("data-card-id");
    await page.keyboard.press("ArrowRight");
    await expect(currentCard(page)).toHaveAttribute("data-unlocked", "false");
    await expect(
      overlay(page).getByRole("button", {
        name: "Принять задание",
        exact: true,
      }),
    ).toHaveCount(0);
    await page.keyboard.press("ArrowLeft");
    await expect(currentCard(page)).toHaveAttribute("data-card-id", first);
    await page.locator(".quest-carousel").hover();
    await page.mouse.wheel(0, 180);
    await expect(currentCard(page)).toHaveAttribute("data-unlocked", "false");
    await page.keyboard.press("ArrowLeft");
    await page.screenshot({ path: info.outputPath(`quests-${theme}.png`) });
    await page.keyboard.press("Escape");
    await expect(overlay(page)).toHaveCount(0);
    await expect(page.locator(".daily-quests-drawer")).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await showCards(page);
    await page.screenshot({
      path: info.outputPath(`quests-mobile-${theme}.png`),
    });
    expect(
      await overlay(page).evaluate((node) => node.scrollWidth <= innerWidth),
    ).toBe(true);
    await page
      .locator(".quest-carousel")
      .dispatchEvent("pointerdown", { clientX: 280, pointerType: "touch" });
    await page
      .locator(".quest-carousel")
      .dispatchEvent("pointerup", { clientX: 80, pointerType: "touch" });
    await expect(currentCard(page)).toHaveAttribute("data-unlocked", "false");
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(
        () => !!document.activeElement.closest("dialog.daily-quest-overlay"),
      ),
    ).toBe(true);
    await page.keyboard.press("Escape");
  });
}

test("writing unlocks cards and a timely manual finish persists without changing timer coin rewards", async ({
  page,
}, info) => {
  await open(page, { clock: true });
  const cardId = await accept(page);
  await expect(page.locator(".quest-run")).toContainText("05:00");
  await expect(
    page.getByRole("button", { name: "Завершить задание" }),
  ).toBeDisabled();
  await append(page, 100);
  await expect.poll(async () => (await progress(page))?.words).toBe(100);
  await expect(
    page.getByRole("button", { name: "Завершить задание" }),
  ).toBeEnabled();
  await page.screenshot({ path: info.outputPath("quest-ready.png") });
  await page.getByRole("button", { name: "Завершить задание" }).click();
  await expect
    .poll(async () => (await progress(page))?.completed)
    .toEqual([cardId]);
  expect((await wallet(page)).coins).toBe(0);
  expect((await wallet(page)).session).not.toBeNull();
  await showCards(page);
  await page.keyboard.press("ArrowRight");
  await expect(currentCard(page)).toHaveAttribute("data-unlocked", "true");
  await page.keyboard.press("Escape");
  await page.clock.fastForward(300000);
  await expect.poll(async () => (await wallet(page)).coins).toBe(5);
  await page.reload();
  await page.getByRole("button", { name: "Задания", exact: true }).click();
  await expect(overlay(page)).toBeVisible();
  expect((await progress(page)).completed).toEqual([cardId]);
});

test("paused writing earns no quest progress and missing the timer deadline cannot complete a quest", async ({
  page,
}) => {
  await open(page, { clock: true });
  await accept(page);
  await page
    .locator(".quest-run")
    .getByRole("button", { name: "Приостановить таймер" })
    .click();
  await append(page, 100);
  await page.clock.runFor(50);
  expect((await progress(page)).words).toBe(0);
  await page
    .locator(".quest-run")
    .getByRole("button", { name: "Продолжить таймер" })
    .click();
  await append(page, 100);
  await expect.poll(async () => (await progress(page))?.words).toBe(100);
  await page.clock.fastForward(300000);
  await expect(page.locator(".quest-run")).toContainText("Время истекло");
  await expect(
    page.getByRole("button", { name: "Завершить задание" }),
  ).toBeDisabled();
  expect((await progress(page)).completed).toEqual([]);
  await page.clock.fastForward(86400000);
  await expect
    .poll(async () => page.locator(".quest-writing-progress").textContent())
    .toContain("0 слов");
  await expect(page.locator('p[data-block-id="action"]')).toContainText(
    "новое99",
  );
});

test("quests and paid continuation cards belong to the selected screenplay version", async ({
  page,
}) => {
  await open(page, { clock: true, coins: 10 });
  await accept(page);
  await append(page, 100);
  await expect.poll(async () => (await progress(page))?.words).toBe(100);
  await selectAppOption(
    page,
    page.getByRole("combobox", { name: "Версии сценария" }),
    "blue",
  );
  await append(page, 100);
  await showCards(page);
  await expect(page.locator(".quest-writing-progress")).toContainText("0 слов");
  await overlay(page).getByRole("button", { name: "Создать идею" }).click();
  await expect.poll(async () => (await wallet(page)).coins).toBe(5);
  await expect(currentCard(page)).toContainText("Продолжение истории");
  await expect(currentCard(page)).toContainText("АННА");
  await expect(currentCard(page)).toContainText("БОРИС");
  await expect(overlay(page).locator(".quest-carousel-nav")).toContainText(
    "из 9",
  );
  await page.keyboard.press("Escape");
  await selectAppOption(
    page,
    page.getByRole("combobox", { name: "Версии сценария" }),
    "white",
  );
  await showCards(page);
  await expect(overlay(page).locator(".quest-carousel-nav")).toContainText(
    "из 8",
  );
  expect((await progress(page)).words).toBe(100);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "ENG", exact: true }).click();
  await page.getByRole("button", { name: "Today's cards" }).click();
  await expect(
    page.getByRole("dialog", { name: "Today's quest cards" }),
  ).toContainText("A new story awaits");
  await page.keyboard.press("Escape");
  await page.clock.fastForward(300000);
  await expect.poll(async () => (await wallet(page)).coins).toBe(10);
  expect((await wallet(page)).ideas).toHaveLength(1);
});

test("idea purchases are synchronized across tabs and cannot spend an unavailable balance", async ({
  page,
  context,
}) => {
  test.setTimeout(60000);
  await open(page, { coins: 5 });
  await showCards(page);
  const second = await context.newPage();
  await grantPro(second);
  await second.goto("/beta");
  await expect(second.locator(".screenplay-editor")).toBeFocused();
  await showCards(second);
  await Promise.all([
    overlay(page)
      .getByRole("button", { name: "Создать идею" })
      .evaluate((node) => node.click()),
    overlay(second)
      .getByRole("button", { name: "Создать идею" })
      .evaluate((node) => node.click()),
  ]);
  await page.bringToFront();
  await expect.poll(async () => (await wallet(page)).coins).toBe(0);
  expect((await wallet(page)).ideas).toHaveLength(1);
  await expect(
    overlay(page).getByRole("button", { name: "Создать идею" }),
  ).toBeDisabled();
  await expect(
    overlay(second).getByRole("button", { name: "Создать идею" }),
  ).toBeDisabled();
  await page.reload();
  await showCards(page);
  expect((await wallet(page)).coins).toBe(0);
  expect((await wallet(page)).ideas).toHaveLength(1);
});

test("a failed purchase does not charge coins or lose the screenplay", async ({
  page,
}) => {
  await open(page, { coins: 5 });
  await showCards(page);
  await page.evaluate((key) => {
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key)
        throw new DOMException("Storage full", "QuotaExceededError");
      return write.call(this, name, value);
    };
  }, WRITING_TIMER_STORAGE);
  await overlay(page).getByRole("button", { name: "Создать идею" }).click();
  await expect(overlay(page).getByRole("status")).toContainText(
    "Не удалось сохранить",
  );
  expect((await wallet(page)).coins).toBe(5);
  expect((await wallet(page)).ideas || []).toHaveLength(0);
  await page.keyboard.press("Escape");
  await expect(page.locator('p[data-block-id="action"]')).toContainText(
    "слово23",
  );
});

test("reduced motion disables carousel transitions", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page);
  await showCards(page);
  await expect(currentCard(page)).toHaveCSS("transition-duration", "0s");
});

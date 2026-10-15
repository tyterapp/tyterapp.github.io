import { openWritingShop } from "./helpers/writing-shop.js";
import { test, expect } from "@playwright/test";
import { createProject } from "../src/data.js";
import {
  cleanWalletExtras,
  purchaseWalletRadio,
  resetWalletProgress,
  walletHasRadio,
} from "../src/writing-wallet.js";
import { grantPro } from "./helpers/pro-access.js";
import { scriptVersionSnapshot } from "../src/script-versions.js";
import { selectAppOption } from "./helpers/app-select.js";

function fixture() {
  const doc = createProject("Диктовка");
  doc.content.content = [
    {
      type: "paragraph",
      attrs: { format: "scene", blockId: "heading", sceneVariant: null },
      content: [{ type: "text", text: "ИНТ. КОМНАТА — ДЕНЬ" }],
    },
    {
      type: "paragraph",
      attrs: { format: "action", blockId: "action", sceneVariant: null },
      content: [{ type: "text", text: "До после.", marks: [{ type: "bold" }] }],
    },
  ];
  const blue = createProject("Другая версия");
  blue.content.content[0].content[0].text = "ЭКС. ДРУГАЯ ВЕРСИЯ — НОЧЬ";
  doc.scriptVersions = { blue: scriptVersionSnapshot(blue) };
  return doc;
}

async function open(
  page,
  {
    coins = 100,
    owned = false,
    width = 1440,
    theme = "light",
    language = "ru",
    unsupported = false,
    prefixed = false,
    error = "",
    deferStop = false,
    deferAudio = false,
    noMeter = false,
    doc = fixture(),
    seed = true,
  } = {},
) {
  await page.setViewportSize({ width, height: width < 832 ? 844 : 1000 });
  await grantPro(page);
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  await page.addInitScript(
    ({
      doc,
      coins,
      owned,
      theme,
      language,
      unsupported,
      prefixed,
      error,
      deferStop,
      deferAudio,
      noMeter,
      seed,
    }) => {
      if (seed && !localStorage.getItem("tyter.radio-seeded")) {
        localStorage.setItem("tyter.radio-seeded", "1");
        localStorage.setItem("tyter.projects.v1", JSON.stringify([doc]));
        localStorage.setItem("tyter.active", doc.id);
        localStorage.setItem("tyter.language.v1", language);
        localStorage.setItem(
          "tyter.editor-preferences.v1",
          JSON.stringify({ theme }),
        );
        const date = new Date(),
          day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
        localStorage.setItem(
          "tyter.writing-timer.v1",
          JSON.stringify({
            coins,
            session: null,
            streak: { day, count: 1, best: 1 },
            ...(owned
              ? {
                  purchases: {
                    "dictation-radio": { purchasedAt: Date.now(), cost: 100 },
                  },
                }
              : {}),
          }),
        );
      }
      const state = (window.radioSpeech = {
        instances: [],
        error,
        deferStop,
        active: false,
        level: 0,
        audioCalls: 0,
        tracksStopped: 0,
        contextsClosed: 0,
      });
      const stream = () => ({
        getTracks: () => [{ stop: () => state.tracksStopped++ }],
      });
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: {
          getUserMedia: () => {
            state.audioCalls++;
            return deferAudio
              ? new Promise((resolve) => {
                  state.resolveAudio = () => resolve(stream());
                })
              : Promise.resolve(stream());
          },
        },
      });
      class AudioMeter {
        state = "running";
        resume() {
          return Promise.resolve();
        }
        close() {
          this.state = "closed";
          state.contextsClosed++;
          return Promise.resolve();
        }
        createMediaStreamSource() {
          return { connect() {}, disconnect() {} };
        }
        createAnalyser() {
          return {
            disconnect() {},
            getByteTimeDomainData(samples) {
              samples.forEach((_, index) => {
                samples[index] = 128 + (index % 2 ? 1 : -1) * state.level * 70;
              });
            },
          };
        }
      }
      Object.defineProperty(window, "AudioContext", {
        configurable: true,
        value: noMeter ? undefined : AudioMeter,
      });
      Object.defineProperty(window, "webkitAudioContext", {
        configurable: true,
        value: undefined,
      });
      class Recognition {
        results = [];
        starts = 0;
        stops = 0;
        aborts = 0;
        constructor() {
          state.instances.push(this);
        }
        start() {
          this.starts++;
          state.active = true;
          queueMicrotask(() => {
            if (state.error) this.onerror?.({ error: state.error });
            else this.onstart?.();
          });
        }
        stop() {
          this.stops++;
          state.active = false;
          if (!state.deferStop) queueMicrotask(() => this.onend?.());
        }
        abort() {
          this.aborts++;
          state.active = false;
          this.onend?.();
        }
        emit(text, final = true, index = this.results.length) {
          const result = [{ transcript: text, confidence: 0.99 }];
          result.isFinal = final;
          this.results[index] = result;
          this.onresult?.({ results: this.results, resultIndex: index });
        }
      }
      Object.defineProperty(window, "SpeechRecognition", {
        configurable: true,
        value: unsupported || prefixed ? undefined : Recognition,
      });
      Object.defineProperty(window, "webkitSpeechRecognition", {
        configurable: true,
        value: unsupported ? undefined : Recognition,
      });
    },
    {
      doc,
      coins,
      owned,
      theme,
      language,
      unsupported,
      prefixed,
      error,
      deferStop,
      deferAudio,
      noMeter,
      seed,
    },
  );
  await page.goto("/beta");
  await page.bringToFront();
  await expect(page.locator(".screenplay-editor")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}
const radio = (page) => page.locator(".writing-radio");
const wallet = (page) =>
  page.evaluate(() =>
    JSON.parse(localStorage.getItem("tyter.writing-timer.v1")),
  );
const json = (page) =>
  page.locator(".screenplay-editor").evaluate((node) => node.editor.getJSON());
async function openRadio(page) {
  if (!(await page.locator("#writing-shop").count()))
    await openWritingShop(page);
  const category = page.getByRole("button", {
    name: /^(Разное|Miscellaneous)$/,
  });
  if (await category.count()) await category.click();
  await expect(radio(page)).toBeVisible();
}
async function start(page) {
  await openRadio(page);
  await radio(page)
    .getByRole("button", { name: /^(Включить микрофон|Turn on microphone)$/ })
    .click();
  await expect(radio(page)).toHaveAttribute("data-recording", "true");
  await expect(radio(page).getByRole("status")).toContainText(
    /Микрофон включён|Microphone is on/,
  );
}
const emit = (page, text, final = true, index) =>
  page.evaluate(
    ({ text, final, index }) =>
      window.radioSpeech.instances.at(-1).emit(text, final, index),
    { text, final, index },
  );

test("radio costs 100 once, survives cleaning and is removed by the common progress reset", () => {
  const initial = { coins: 100, session: null };
  expect(purchaseWalletRadio({ ...initial, coins: 99 })).toMatchObject({
    ok: false,
    reason: "coins",
  });
  const bought = purchaseWalletRadio(initial, 123).wallet;
  expect(bought.coins).toBe(0);
  expect(walletHasRadio(bought)).toBe(true);
  expect(cleanWalletExtras(bought).purchases["dictation-radio"]).toEqual({
    purchasedAt: 123,
    cost: 100,
  });
  expect(purchaseWalletRadio(bought, 456)).toMatchObject({
    ok: true,
    alreadyOwned: true,
    wallet: bought,
  });
  expect(initial).toEqual({ coins: 100, session: null });
  const reset = resetWalletProgress({ ...bought, coins: 200 });
  expect(reset.wallet.coins).toBe(0);
  expect(walletHasRadio(reset.wallet)).toBe(false);
});

test("radio is a separate miscellaneous item; buying never turns the mic on, and reuse and reload never charge again", async ({
  page,
}, info) => {
  await open(page);
  await openWritingShop(page);
  await expect(page.locator("#writing-shop")).not.toContainText("Рация");
  await openRadio(page);
  await expect(
    page.locator("#writing-shop").getByText("Зажигалка", { exact: true }),
  ).toBeVisible();
  await radio(page)
    .getByRole("button", { name: "Купить рацию за 100 монет", exact: true })
    .click();
  await expect(
    radio(page).getByRole("button", { name: "Включить микрофон", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => radioSpeech.instances.length)).toBe(0);
  expect((await wallet(page)).coins).toBe(0);
  await page.screenshot({ path: info.outputPath("radio-owned.png") });
  for (let i = 0; i < 2; i++) {
    await start(page);
    await radio(page)
      .getByRole("button", { name: "Выключить микрофон", exact: true })
      .click();
    await expect(radio(page)).not.toHaveAttribute("data-recording");
    expect((await wallet(page)).coins).toBe(0);
  }
  await page.reload();
  await openRadio(page);
  await expect(
    radio(page).getByRole("button", { name: "Включить микрофон", exact: true }),
  ).toBeVisible();
  expect((await wallet(page)).purchases["dictation-radio"].cost).toBe(100);
  expect(await page.evaluate(() => radioSpeech.instances.length)).toBe(0);
});

test("live drafts appear inline and are replaced without saving or rewards; final phrases preserve the mapped caret, formatting and undo", async ({
  page,
}) => {
  await open(page, { owned: true, coins: 0 });
  await page.locator(".screenplay-editor").evaluate((node) => {
    const editor = node.editor;
    editor.commands.setTextSelection(editor.state.doc.child(0).nodeSize + 3);
  });
  const before = await json(page);
  await start(page);
  await emit(page, "кошка у окна", false, 0);
  await expect(
    page.locator(".screenplay-editor .dictation-preview"),
  ).toHaveText("кошка у окна");
  await emit(page, "кошка у открытого окна", false, 0);
  await expect(
    page.locator(".screenplay-editor .dictation-preview"),
  ).toHaveText("кошка у открытого окна");
  await expect(page.locator(".screenplay-editor")).not.toContainText(
    "кошка у окна",
  );
  expect(await json(page)).toEqual(before);
  expect((await wallet(page)).coins).toBe(0);
  await page
    .locator(".screenplay-editor")
    .evaluate((node) =>
      node.editor.commands.insertContentAt(
        node.editor.state.doc.child(0).nodeSize + 1,
        "Вначале ",
      ),
    );
  const prefix = await json(page),
    phrase = "кошка ".repeat(18).trim();
  await emit(page, phrase, true, 0);
  await expect(page.locator(".dictation-preview")).toHaveText("");
  await expect(
    page.locator('.screenplay-editor [data-format="action"]'),
  ).toHaveText(`Вначале До ${phrase} после.`);
  await expect.poll(async () => (await wallet(page)).coins).toBe(10);
  const first = await json(page);
  await emit(page, phrase, true, 0);
  expect(await json(page)).toEqual(first);
  expect((await wallet(page)).coins).toBe(10);
  await emit(page, "идёт <домой> & отдыхает.");
  const after = await json(page);
  expect(after.content[1].attrs).toEqual(before.content[1].attrs);
  expect(after.content[0]).toEqual(before.content[0]);
  expect(
    after.content[1].content.every((node) =>
      node.marks?.some((mark) => mark.type === "bold"),
    ),
  ).toBe(true);
  expect(after.content[1].content.map((node) => node.text).join("")).toBe(
    `Вначале До ${phrase} идёт <домой> & отдыхает. после.`,
  );
  await radio(page)
    .getByRole("button", { name: "Выключить микрофон", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Закрыть магазин", exact: true })
    .click();
  await expect(page.locator("#writing-shop")).toHaveCount(0);
  await expect(page.locator(".dictation-preview")).toHaveCount(0);
  await page.locator(".screenplay-editor").press("Control+z");
  expect(await json(page)).toEqual(first);
  await page.locator(".screenplay-editor").press("Control+z");
  expect(await json(page)).toEqual(prefix);
  expect((await wallet(page)).coins).toBe(10);
});

for (const error of ["not-allowed", "network"])
  test(`${error}: microphone failures leave text and coins intact and allow an explicit retry`, async ({
    page,
  }) => {
    await open(page, { owned: true, error });
    const before = await json(page);
    await openRadio(page);
    await radio(page)
      .getByRole("button", { name: "Включить микрофон", exact: true })
      .click();
    await expect(radio(page).getByRole("alert")).toContainText(
      error === "network" ? "интернет" : "разрешения сайта",
    );
    expect(await json(page)).toEqual(before);
    expect((await wallet(page)).coins).toBe(100);
    expect(await page.evaluate(() => radioSpeech.active)).toBe(false);
    await page.evaluate(() => {
      radioSpeech.error = "";
    });
    await start(page);
    await emit(page, "Повторная попытка.");
    await expect(page.locator(".screenplay-editor")).toContainText(
      "Повторная попытка.",
    );
  });

test("unsupported browsers show an explanation and cannot spend coins on an unusable microphone", async ({
  page,
}) => {
  await open(page, { unsupported: true });
  await openRadio(page);
  await expect(radio(page)).toContainText(
    "В этом браузере диктовка недоступна.",
  );
  await expect(
    radio(page).getByRole("button", {
      name: "Купить рацию за 100 монет",
      exact: true,
    }),
  ).toBeDisabled();
  expect((await wallet(page)).coins).toBe(100);
  await page
    .getByRole("button", { name: "Закрыть магазин", exact: true })
    .click();
  await page.locator(".screenplay-editor p").last().press("End");
  await page.keyboard.insertText(" Редактор работает.");
  await expect(page.locator(".screenplay-editor")).toContainText(
    "Редактор работает.",
  );
});

for (const [width, theme] of [
  [320, "light"],
  [832, "dark"],
])
  test(`${width}px ${theme}: prefixed recognition follows ENG and Escape stops the mic without overflowing the shop`, async ({
    page,
  }, info) => {
    await open(page, {
      owned: true,
      width,
      theme,
      language: "en",
      prefixed: true,
    });
    await start(page);
    expect(await page.evaluate(() => radioSpeech.instances.at(-1).lang)).toBe(
      "en-US",
    );
    await emit(page, "A cat watches the rain.", false, 0);
    const wave = radio(page).locator(".writing-radio-wave");
    await expect(wave).toBeVisible();
    await expect(wave).toHaveAttribute("data-speaking", "false");
    await page.evaluate(() => {
      radioSpeech.level = 0.8;
    });
    await expect(wave).toHaveAttribute("data-speaking", "true");
    const colors = await radio(page)
      .getByRole("button", { name: "Turn off microphone", exact: true })
      .evaluate((button) => {
        const style = getComputedStyle(button),
          canvas = document.createElement("canvas"),
          context = canvas.getContext("2d");
        const rgb = (color) => {
          context.fillStyle = color;
          context.fillRect(0, 0, 1, 1);
          return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
        };
        const luminance = (color) =>
          rgb(color)
            .map((value) => value / 255)
            .map((value) =>
              value <= 0.04045
                ? value / 12.92
                : ((value + 0.055) / 1.055) ** 2.4,
            )
            .reduce(
              (sum, value, index) =>
                sum + value * [0.2126, 0.7152, 0.0722][index],
              0,
            );
        return {
          background: rgb(style.backgroundColor),
          contrast:
            (luminance(style.color) + 0.05) /
            (luminance(style.backgroundColor) + 0.05),
        };
      });
    expect(colors.background[0]).toBeGreaterThan(colors.background[1] * 2);
    expect(colors.contrast).toBeGreaterThanOrEqual(4.5);
    await page.evaluate(() => {
      radioSpeech.level = 0;
    });
    await expect(wave).toHaveAttribute("data-speaking", "false");
    await expect(wave.locator("rect").first()).toHaveAttribute(
      "height",
      /3\.[0-2]\d/,
    );
    const box = await page.locator("#writing-shop").boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(box.y).toBeGreaterThanOrEqual(0);
    await page.screenshot({ path: info.outputPath("radio-listening.png") });
    await page.keyboard.press("Escape");
    await expect(page.locator("#writing-shop")).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => radioSpeech.active))
      .toBe(false);
    expect(
      await page.evaluate(() => [
        radioSpeech.tracksStopped,
        radioSpeech.contextsClosed,
      ]),
    ).toEqual([1, 1]);
  });

test("pending final results after a version switch never enter the new version", async ({
  page,
}) => {
  await open(page, { owned: true, deferStop: true });
  const before = await json(page);
  await start(page);
  await emit(page, "Черновик только в старой версии", false, 0);
  await page.evaluate(() => {
    window.lateRadioResult = radioSpeech.instances.at(-1).onresult;
  });
  await selectAppOption(
    page,
    page.getByRole("combobox", { name: "Версии сценария" }),
    "blue",
  );
  await expect(page.locator(".screenplay-editor")).toContainText(
    "ДРУГАЯ ВЕРСИЯ",
  );
  const blue = await json(page);
  await page.evaluate(() => {
    const result = [{ transcript: "Нельзя вставлять в другую версию" }];
    result.isFinal = true;
    lateRadioResult({ resultIndex: 0, results: [result] });
  });
  expect(await json(page)).toEqual(blue);
  await expect(page.locator(".dictation-preview")).toHaveCount(0);
  expect(await page.evaluate(() => radioSpeech.active)).toBe(false);
  await selectAppOption(
    page,
    page.getByRole("combobox", { name: "Версии сценария" }),
    "white",
  );
  expect(await json(page)).toEqual(before);
});

test("closing the shop releases the mic and accepts its final captured phrase once; reset removes access", async ({
  page,
}) => {
  await open(page, { owned: true, coins: 200, deferStop: true });
  await start(page);
  await page
    .getByRole("button", { name: "Закрыть магазин", exact: true })
    .click();
  await expect(page.locator("#writing-shop")).toHaveCount(0);
  expect(await page.evaluate(() => radioSpeech.active)).toBe(false);
  await emit(page, "Последняя фраза перед остановкой.");
  await page.evaluate(() => radioSpeech.instances.at(-1).onend?.());
  await expect(page.locator(".screenplay-editor")).toContainText(
    "Последняя фраза перед остановкой.",
  );
  await start(page);
  await radio(page)
    .getByRole("button", { name: "Выключить микрофон", exact: true })
    .click();
  await page.evaluate(() => radioSpeech.instances.at(-1).onend?.());
  await expect(radio(page)).not.toHaveAttribute("data-recording");
  await page.getByRole("button", { name: /^Сбросить прогресс/ }).click();
  await page
    .getByRole("button", { name: "Сбросить за 200 монет", exact: true })
    .click();
  await expect.poll(async () => (await wallet(page)).coins).toBe(0);
  expect(walletHasRadio(await wallet(page))).toBe(false);
  await expect.poll(() => page.evaluate(() => radioSpeech.active)).toBe(false);
  await openRadio(page);
  await expect(
    radio(page).getByRole("button", {
      name: "Купить рацию за 100 монет",
      exact: true,
    }),
  ).toBeDisabled();
});

test("two tabs purchase the radio only once under the shared wallet lock", async ({
  page,
  context,
}) => {
  await open(page, { coins: 200 });
  const second = await context.newPage();
  await open(second, { seed: false });
  await openRadio(page);
  await openRadio(second);
  const a = await radio(page)
    .getByRole("button", { name: "Купить рацию за 100 монет", exact: true })
    .elementHandle();
  const b = await radio(second)
    .getByRole("button", { name: "Купить рацию за 100 монет", exact: true })
    .elementHandle();
  await Promise.all([
    a.evaluate((button) => button.click()),
    b.evaluate((button) => button.click()),
  ]);
  await expect(
    radio(page).getByRole("button", { name: "Включить микрофон", exact: true }),
  ).toBeVisible();
  await expect(
    radio(second).getByRole("button", {
      name: "Включить микрофон",
      exact: true,
    }),
  ).toBeVisible();
  expect((await wallet(page)).coins).toBe(100);
  expect((await wallet(second)).coins).toBe(100);
  await second.close();
});

test("restoring text invalidates pending speech even with the same block ids, and hiding the tab aborts capture", async ({
  page,
}) => {
  await open(page, { owned: true });
  await start(page);
  const before = await json(page);
  await page.locator(".screenplay-editor").evaluate((node) =>
    node.editor.commands.setContent(node.editor.getJSON(), {
      emitUpdate: false,
    }),
  );
  await emit(page, "Эту фразу уже нельзя вставить.");
  await expect(radio(page).getByRole("alert")).toContainText(
    "Позиция вставки изменилась",
  );
  expect(await json(page)).toEqual(before);
  expect(await page.evaluate(() => radioSpeech.active)).toBe(false);
  await start(page);
  await page.evaluate(() => {
    window.lateRadioResult = radioSpeech.instances.at(-1).onresult;
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    const result = [{ transcript: "Скрытая вкладка" }];
    result.isFinal = true;
    lateRadioResult({ results: [result], resultIndex: 0 });
  });
  expect(await json(page)).toEqual(before);
  expect(await page.evaluate(() => radioSpeech.active)).toBe(false);
});

test("stopping saves the last visible draft once and releases the visualizer microphone immediately", async ({
  page,
}) => {
  await open(page, { owned: true, deferStop: true });
  const before = await json(page);
  await start(page);
  await emit(page, "Текст по ходу разговора.", false, 0);
  expect(await json(page)).toEqual(before);
  await expect(page.locator(".dictation-preview")).toHaveText(
    "Текст по ходу разговора.",
  );
  await radio(page)
    .getByRole("button", { name: "Выключить микрофон", exact: true })
    .click();
  expect(
    await page.evaluate(() => [
      radioSpeech.active,
      radioSpeech.tracksStopped,
      radioSpeech.contextsClosed,
    ]),
  ).toEqual([false, 1, 1]);
  await page.evaluate(() => radioSpeech.instances.at(-1).onend?.());
  await expect(page.locator(".dictation-preview")).toHaveCount(0);
  await expect(page.locator(".screenplay-editor")).toContainText(
    "Текст по ходу разговора.",
  );
  const after = await json(page);
  await page.evaluate(() => radioSpeech.instances.at(-1).onend?.());
  expect(await json(page)).toEqual(after);
  await page.locator(".screenplay-editor").press("Control+z");
  expect(await json(page)).toEqual(before);
});

test("a progress reset in another tab cancels the draft and closes even a late microphone stream", async ({
  page,
}) => {
  await open(page, { owned: true, deferAudio: true });
  await start(page);
  const before = await json(page);
  await emit(page, "Неподтверждённая фраза.", false, 0);
  await page.evaluate(() => {
    const key = "tyter.writing-timer.v1";
    const current = JSON.parse(localStorage.getItem(key));
    localStorage.setItem(
      key,
      JSON.stringify({ ...current, coins: 0, purchases: {} }),
    );
    window.dispatchEvent(new StorageEvent("storage", { key }));
  });
  await expect(page.locator(".dictation-preview")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => radioSpeech.active)).toBe(false);
  await page.evaluate(() => radioSpeech.resolveAudio());
  expect(await json(page)).toEqual(before);
  await expect
    .poll(() => page.evaluate(() => radioSpeech.tracksStopped))
    .toBe(1);
  expect(await page.evaluate(() => radioSpeech.contextsClosed)).toBe(1);
  expect(
    await page.evaluate(() => localStorage.getItem("tyter.projects.v1")),
  ).not.toContain("Неподтверждённая");
});

test("speech events animate the fallback wave without Web Audio", async ({
  page,
}) => {
  await open(page, { owned: true, noMeter: true });
  await start(page);
  const wave = radio(page).locator(".writing-radio-wave");
  await expect(wave).toHaveAttribute("data-speaking", "false");
  await page.evaluate(() => radioSpeech.instances.at(-1).onspeechstart());
  await expect(wave).toHaveAttribute("data-speaking", "true");
  await page.evaluate(() => radioSpeech.instances.at(-1).onspeechend());
  await expect(wave).toHaveAttribute("data-speaking", "false");
  expect(await page.evaluate(() => radioSpeech.audioCalls)).toBe(0);
});

for (const width of [320, 1440])
  test(`${width}px: live speech follows the insertion point smoothly above the compact radio and formatting bar`, async ({
    page,
  }, info) => {
    const doc = fixture();
    doc.content.content.push(
      ...Array.from({ length: 70 }, (_, index) => ({
        type: "paragraph",
        attrs: { format: "action", blockId: `action-${index}` },
        content: [
          {
            type: "text",
            text:
              `Действие ${index + 1}. ` +
              "По улице неспешно идёт герой. ".repeat(5),
          },
        ],
      })),
    );
    await open(page, { owned: true, doc, width });
    if (width === 320) await page.setViewportSize({ width, height: 560 });
    await page.locator(".screenplay-editor").evaluate((node) => {
      node.editor.commands.setTextSelection(
        node.editor.state.doc.content.size - 1,
      );
      const scroller = node.closest(".minimal-scroll");
      scroller.scrollTop = 0;
      window.radioScroll = [];
      scroller.addEventListener("scroll", () =>
        radioScroll.push(scroller.scrollTop),
      );
    });
    await start(page);
    await emit(page, "Герой останавливается и смотрит в окно.", false, 0);
    const preview = page.locator(".dictation-preview-caret");
    await expect(preview).toBeInViewport();
    await expect
      .poll(() => preview.boundingBox().then((box) => box.y))
      .toBeLessThan(width === 320 ? 280 : 650);
    const caret = await preview.boundingBox(),
      popup = await page.locator("#writing-shop").boundingBox();
    expect(caret.y).toBeGreaterThan(60);
    expect(caret.x).toBeGreaterThanOrEqual(0);
    expect(caret.x + caret.width).toBeLessThanOrEqual(width);
    if (caret.x < popup.x + popup.width && caret.x > popup.x)
      expect(caret.y + caret.height).toBeLessThan(popup.y);
    const movement = await page.evaluate(() =>
      radioScroll.filter((value) => value > 0),
    );
    expect(movement.length).toBeGreaterThan(2);
    expect(movement[0]).toBeLessThan(movement.at(-1));
    await expect(page.locator("#writing-shop")).not.toContainText(
      "Подарочная коробка",
    );
    await page.screenshot({
      path: info.outputPath("live-inline-dictation.png"),
    });
  });

test("reduced motion keeps the wave still and immediately reveals the live draft", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page, { owned: true });
  await start(page);
  await page.evaluate(() => {
    radioSpeech.level = 1;
  });
  await emit(page, "Слова сразу в сценарии.", false, 0);
  await expect(page.locator(".dictation-preview")).toHaveText(
    "Слова сразу в сценарии.",
  );
  await expect(
    radio(page).locator(".writing-radio-wave rect").first(),
  ).toHaveAttribute("height", "3");
  await expect(page.locator(".dictation-preview-caret")).toBeInViewport();
});

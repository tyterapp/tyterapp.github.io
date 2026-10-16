import { test, expect } from "@playwright/test";
import { createProject } from "../src/data.js";
import {
  decodeMorse,
  MORSE_DASH,
  MORSE_LETTER_GAP,
  MORSE_WORD_GAP,
} from "../src/morse.js";
import { grantPro } from "./helpers/pro-access.js";
import {
  createTelegraphAudio,
  TELEGRAPH_FREQUENCY,
} from "../src/telegraph-audio.js";

test("Morse alphabets decode Latin, Cyrillic, digits and punctuation independently", () => {
  const codes = {
    en: { H: "....", I: "..", W: ".--", Q: "--.-", X: "-..-" },
    ru: {
      Х: "....",
      И: "..",
      В: ".--",
      Щ: "--.-",
      Ь: "-..-",
      Ж: "...-",
      Ч: "---.",
      Ш: "----",
      Э: "..-..",
      Ю: "..--",
      Я: ".-.-",
      Ъ: "--.--",
    },
  };
  for (const [language, letters] of Object.entries(codes))
    for (const [letter, code] of Object.entries(letters))
      expect(decodeMorse(code, language)).toBe(letter);
  expect(decodeMorse(".----", "ru")).toBe("1");
  expect(decodeMorse("..--..", "en")).toBe("?");
  expect(decodeMorse("---------", "en")).toBe(null);
  expect(MORSE_DASH).toBeLessThan(MORSE_LETTER_GAP);
  expect(MORSE_WORD_GAP / MORSE_LETTER_GAP).toBe(7 / 3);
});

async function open(
  page,
  {
    language = "en",
    theme = "light",
    width = 1440,
    pro = false,
    clock = true,
  } = {},
) {
  await page.setViewportSize({ width, height: width < 832 ? 844 : 1000 });
  if (pro) await grantPro(page);
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  const doc = createProject("Телеграф");
  doc.content.content = [
    { type: "paragraph", attrs: { format: "scene", blockId: "first" } },
    {
      type: "paragraph",
      attrs: { format: "action", blockId: "second" },
      content: [{ type: "text", text: "Сохранённый текст." }],
    },
  ];
  await page.addInitScript(
    ({ doc, language, theme }) => {
      if (!sessionStorage.getItem("telegraph-seeded")) {
        localStorage.setItem("tyter.projects.v1", JSON.stringify([doc]));
        localStorage.setItem("tyter.active", doc.id);
        localStorage.setItem("tyter.language.v1", language);
        localStorage.setItem(
          "tyter.editor-preferences.v1",
          JSON.stringify({ theme }),
        );
        localStorage.setItem("tyter.onboarding.v1", "done");
        sessionStorage.setItem("telegraph-seeded", "true");
      }
      window.telegraphAudio = {
        starts: 0,
        stops: 0,
        frequencies: [],
        types: [],
        mediaPlays: 0,
        closed: 0,
      };
      HTMLMediaElement.prototype.play = function () {
        window.telegraphAudio.mediaPlays++;
        return Promise.resolve();
      };
      window.AudioContext = class {
        state = "running";
        currentTime = 0;
        destination = {};
        createOscillator() {
          return {
            frequency: { value: 0 },
            type: "",
            connect(node) {
              return node;
            },
            disconnect() {},
            start() {
              window.telegraphAudio.starts++;
              window.telegraphAudio.frequencies.push(this.frequency.value);
              window.telegraphAudio.types.push(this.type);
            },
            stop() {
              window.telegraphAudio.stops++;
            },
          };
        }
        createGain() {
          return {
            gain: {
              value: 0,
              cancelScheduledValues() {},
              setValueAtTime(value) {
                this.value = value;
              },
              linearRampToValueAtTime(value) {
                this.value = value;
              },
            },
            connect() {
              return this;
            },
            disconnect() {},
          };
        }
        resume() {
          this.state = "running";
          return Promise.resolve();
        }
        close() {
          window.telegraphAudio.closed++;
          return Promise.resolve();
        }
      };
    },
    { doc, language, theme },
  );
  await page.goto(pro ? "/pro" : "/free");
  await expect(page.locator(".screenplay-editor")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator(".focus-telegraph-button")).toHaveCount(0);
  await page
    .locator(".screenplay-editor")
    .evaluate((node) => node.editor.commands.focus("start"));
  await page.locator(".focus-mode-toggle").click();
  await expect(page.locator(".focus-telegraph-button")).toBeVisible();
  await page.locator(".focus-telegraph-button").click();
  await expect(page.locator(".telegraph-key")).toBeVisible();
  if (clock) {
    const time = Date.now();
    await page.clock.install({ time });
    // Browser assertions must not add wall-clock time to a Morse press.
    await page.clock.pauseAt(time + 1000);
  }
}
const editorJSON = (page) =>
  page.locator(".screenplay-editor").evaluate((node) => node.editor.getJSON());
const first = (page) =>
  expect.poll(() =>
    page
      .locator(".screenplay-editor")
      .evaluate((node) => node.editor.state.doc.firstChild.textContent),
  );
const formatGap = (page) =>
  page.locator(".focus-telegraph").evaluate((node) => {
    const bar = [
      ...node
        .closest(".editor-column")
        .querySelectorAll(".focus-format-hint, .screenplay-format-bar"),
    ].find((candidate) => candidate.getClientRects().length);
    return (
      bar.getBoundingClientRect().top - node.getBoundingClientRect().bottom
    );
  });
async function signal(page, symbol = ".", keyboard = false) {
  const key = page.locator(".telegraph-key");
  if (keyboard) {
    await key.focus();
    await page.keyboard.down("Space");
  } else {
    const box = await key.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
  }
  await expect(key).toHaveAttribute("aria-pressed", "true");
  await expect(key.locator(".telegraph-pressed")).toHaveCSS("opacity", "1");
  await page.clock.fastForward(symbol === "-" ? MORSE_DASH + 80 : 70);
  if (keyboard) await page.keyboard.up("Space");
  else await page.mouse.up();
  await expect(key).toHaveAttribute("aria-pressed", "false");
  await expect(key.locator(".telegraph-pressed")).toHaveCSS("opacity", "0");
}
async function letter(page, code, keyboard = false) {
  for (const symbol of code) {
    await signal(page, symbol, keyboard);
    await page.clock.fastForward(80);
  }
  await page.clock.fastForward(MORSE_LETTER_GAP);
}

test("English HI enters the first scene with mouse taps; a held key sustains one tone without sample repetition", async ({
  page,
}, info) => {
  await open(page);
  const snapshot = await editorJSON(page);
  await expect(page.locator(".focus-telegraph")).toHaveCSS("width", "280px");
  await expect(page.locator(".telegraph-tape")).toHaveCSS("width", "280px");
  expect(await formatGap(page)).toBeCloseTo(22, 0);
  await expect(page.locator(".telegraph-key img").first()).toHaveJSProperty(
    "naturalWidth",
    280,
  );
  await letter(page, "....");
  await first(page).toBe("H");
  await letter(page, "..");
  await first(page).toBe("HI");
  await expect(page.locator(".telegraph-output")).toHaveText("HI");
  await expect(page.locator(".telegraph-output")).toHaveCSS(
    "clip-path",
    "inset(50%)",
  );
  await expect(page.locator(".telegraph-output")).toHaveCSS(
    "position",
    "absolute",
  );
  expect((await editorJSON(page)).content[1]).toEqual(snapshot.content[1]);
  expect((await editorJSON(page)).content[0].attrs.format).toBe("scene");
  const audio = await page.evaluate(() => window.telegraphAudio);
  expect(audio.starts).toBe(6);
  expect(audio.stops).toBe(6);
  expect(audio.frequencies).toEqual(Array(6).fill(TELEGRAPH_FREQUENCY));
  expect(audio.types).toEqual(Array(6).fill("sine"));
  expect(audio.mediaPlays).toBe(0);
  await page.clock.runFor(400);
  await page.screenshot({ path: info.outputPath("telegraph-hi.png") });
  const key = page.locator(".telegraph-key");
  const box = await key.boundingBox();
  await page.mouse.move(box.x + 140, box.y + 60);
  await page.mouse.down();
  await page.clock.fastForward(5000);
  await expect(page.locator(".telegraph-live-signal")).toHaveCSS(
    "width",
    "18px",
  );
  const held = await page.evaluate(() => window.telegraphAudio);
  expect(held.starts).toBe(7);
  expect(held.stops).toBe(6);
  expect(held.frequencies).toEqual(Array(7).fill(TELEGRAPH_FREQUENCY));
  await key.dispatchEvent("pointercancel", { pointerId: 1 });
  await page.mouse.up();
  await page.locator(".focus-telegraph-button").click();
  await expect(page.locator(".focus-telegraph")).toHaveCount(0);
  await expect(page.locator(".screenplay-editor")).toBeFocused();
  await page.locator(".screenplay-editor").press("Control+z");
  await first(page).not.toBe("HI");
});

test("Russian key handles held dashes, keyboard taps, word pauses and cancels pending input on close", async ({
  page,
}, info) => {
  await open(page, { language: "ru", theme: "dark", pro: true });
  await letter(page, "--");
  await letter(page, "..", true);
  await letter(page, ".-.");
  await first(page).toBe("МИР");
  await page.clock.fastForward(MORSE_WORD_GAP);
  await letter(page, "--..");
  await first(page).toBe("МИР З");
  await page.clock.runFor(400);
  const positions = async () => {
    // CSS transitions use the rendering clock even while Morse timers are paused.
    await expect
      .poll(() =>
        page.locator(".telegraph-signals").evaluate((node) => {
          const actual = new DOMMatrix(getComputedStyle(node).transform).m41;
          const target = new DOMMatrix(node.style.transform).m41;
          return Math.abs(actual - target);
        }),
      )
      .toBe(0);
    return page.locator(".telegraph-signal").evaluateAll((nodes) =>
      nodes.map((node) => ({
        x: node.getBoundingClientRect().x,
        width: node.getBoundingClientRect().width,
      })),
    );
  };
  const beforePause = await positions();
  await page.clock.fastForward(MORSE_WORD_GAP);
  await page.clock.runFor(200);
  expect(await positions()).toEqual(beforePause);
  await page.screenshot({ path: info.outputPath("telegraph-russian.png") });
  const key = page.locator(".telegraph-key");
  await key.dispatchEvent("pointerdown", { pointerId: 11, button: 0 });
  await page.clock.runFor(MORSE_DASH - 100);
  const beforeRelease = await positions();
  await expect(page.locator(".telegraph-live-signal")).toHaveCSS(
    "width",
    "6px",
  );
  await page.locator(".telegraph-live-signal").evaluate((node) => {
    window.telegraphHeldMark = node;
  });
  await key.dispatchEvent("pointerup", { pointerId: 11, button: 0 });
  await page.clock.runFor(160);
  expect(await positions()).toEqual(beforeRelease);
  expect(
    await page.evaluate(
      () =>
        window.telegraphHeldMark ===
        document.querySelector(".telegraph-signals").lastElementChild,
    ),
  ).toBe(true);
  await page.locator(".focus-telegraph-button").click();
  await page.clock.fastForward(2000);
  await first(page).toBe("МИР З");
  await page.keyboard.press("Escape");
  await expect(page.locator(".focus-telegraph-button")).toHaveCount(0);
});

test("cancellation, blur and alphabet changes do not write phantom letters; text is inserted at the active caret", async ({
  page,
}) => {
  await open(page, { language: "ru" });
  const key = page.locator(".telegraph-key");
  await key.dispatchEvent("pointerdown", {
    pointerId: 7,
    pointerType: "touch",
    button: 0,
  });
  await page.clock.fastForward(450);
  await key.dispatchEvent("pointercancel", { pointerId: 7 });
  await page.clock.fastForward(2000);
  await first(page).toBe("");
  await key.focus();
  await page.keyboard.down("Space");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.keyboard.up("Space");
  await page.clock.fastForward(2000);
  await first(page).toBe("");
  await signal(page, ".");
  await page.evaluate(() => {
    localStorage.setItem("tyter.language.v1", "en");
    window.dispatchEvent(
      new StorageEvent("storage", { key: "tyter.language.v1" }),
    );
  });
  await expect(page.locator(".telegraph-key")).toHaveAttribute(
    "aria-label",
    "Telegraph key",
  );
  await page.clock.fastForward(2000);
  await first(page).toBe("");
  await page.locator(".screenplay-editor").evaluate((node) => {
    const editor = node.editor;
    editor.commands.setTextSelection(
      editor.state.doc.firstChild.nodeSize + 1 + 5,
    );
  });
  await letter(page, ".");
  await expect(page.locator('[data-block-id="second"]')).toHaveText(
    "СохраEнённый текст.",
  );
});

test.describe("touch", () => {
  test.use({ hasTouch: true });
  test("320px touch key and 280px tape fit without scrollbars and stop when leaving fullscreen", async ({
    page,
  }, info) => {
    await open(page, { theme: "dark", width: 320 });
    await page.touchscreen.tap(
      160,
      (await page.locator(".telegraph-key").boundingBox()).y + 60,
    );
    await page.clock.fastForward(MORSE_LETTER_GAP + 20);
    await first(page).toBe("E");
    const bounds = await page.locator(".focus-telegraph").boundingBox();
    expect(bounds.width).toBe(280);
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
    const overflow = await page
      .locator(".focus-telegraph")
      .evaluate((node) => node.scrollWidth - node.clientWidth);
    expect(overflow).toBe(0);
    expect(await formatGap(page)).toBeCloseTo(22, 0);
    for (const selector of [
      ".focus-mode-toggle",
      ".focus-typewriter-button",
      ".focus-telegraph-button",
    ]) {
      const button = await page.locator(selector).boundingBox();
      expect(button.y + button.height).toBeLessThan(bounds.y);
    }
    await page.clock.runFor(400);
    await page.screenshot({ path: info.outputPath("telegraph-mobile.png") });
    await page.locator(".focus-mode-toggle").click();
    await expect(page.locator(".focus-telegraph")).toHaveCount(0);
    await page.clock.fastForward(2000);
    await first(page).toBe("E");
  });
});

test("real-time input keeps the caret above the key and restores normal fullscreen controls", async ({
  page,
}, info) => {
  await open(page, { clock: false, width: 832 });
  await page.locator(".telegraph-key").click();
  await first(page).toBe("E");
  await expect
    .poll(() =>
      page.locator(".screenplay-editor").evaluate((node) => {
        const top = node.closest(".minimal-scroll").getBoundingClientRect().top;
        return (
          node.editor.view.coordsAtPos(node.editor.state.selection.from).top -
          top
        );
      }),
    )
    .toBeGreaterThanOrEqual(8);
  const geometry = await page.locator(".screenplay-editor").evaluate((node) => {
    const scroller = node.closest(".minimal-scroll");
    const caret = node.editor.view.coordsAtPos(
      node.editor.state.selection.from,
    );
    const key = document
      .querySelector(".focus-telegraph")
      .getBoundingClientRect();
    return {
      top: caret.top,
      bottom: caret.bottom,
      scrollTop: scroller.getBoundingClientRect().top,
      keyTop: key.top,
      bodyScroll: window.scrollY,
      innerScroll: scroller.scrollTop,
    };
  });
  expect(geometry.top, JSON.stringify(geometry)).toBeGreaterThanOrEqual(
    geometry.scrollTop + 8,
  );
  expect(geometry.bottom).toBeLessThan(geometry.keyTop);
  expect(await formatGap(page)).toBeCloseTo(22, 0);
  await page.screenshot({ path: info.outputPath("telegraph-real-time.png") });
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(() => formatGap(page)).toBeCloseTo(22, 0);
});

test("release before the audio context resumes cannot start a delayed tone", async () => {
  let resume,
    starts = 0,
    closed = 0;
  class SuspendedContext {
    state = "suspended";
    resume() {
      return new Promise((resolve) => {
        resume = resolve;
      });
    }
    createOscillator() {
      starts++;
      throw new Error("A cancelled press must not create a voice");
    }
    close() {
      closed++;
      return Promise.resolve();
    }
  }
  const sound = createTelegraphAudio(SuspendedContext);
  sound.start();
  sound.stop();
  resume();
  await Promise.resolve();
  expect(starts).toBe(0);
  sound.dispose();
  expect(closed).toBe(1);
});

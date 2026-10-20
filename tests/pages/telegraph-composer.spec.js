import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { loadImage } from "@napi-rs/canvas";
import { readTelegram } from "../../src/telegram.js";
import { MORSE_LETTER_GAP, MORSE_DASH } from "../../src/morse.js";

async function open(page, { theme = "light", language = "en" } = {}) {
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  await page.addInitScript(
    ({ theme, language }) => {
      localStorage.setItem(
        "tyter.editor-preferences.v1",
        JSON.stringify({ theme }),
      );
      localStorage.setItem("tyter.language.v1", language);
      if (!sessionStorage.getItem("composer-seed")) {
        localStorage.removeItem("tyter.telegraph-draft.v1");
        localStorage.setItem("tyter.projects.v1", "[]");
        sessionStorage.setItem("composer-seed", "1");
      }
    },
    { theme, language },
  );
  await page.goto("/telegraph/");
  await expect(page.locator(".telegraph-document")).toBeVisible();
  await expect(page.locator(".telegraph-document")).toBeFocused();
  await expect(page.locator(".telegraph-key img").first()).toHaveJSProperty(
    "naturalWidth",
    280,
  );
}
const text = (page) => page.locator(".telegraph-document").innerText();
async function paste(page, value) {
  await page.locator(".telegraph-document").evaluate((element, value) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/plain", value);
    clipboardData.setData("text/html", `<h1><b>UNWANTED FORMATTING</b></h1>`);
    element.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData,
      }),
    );
  }, value);
}
async function signal(page, symbol = ".", shortcut = false) {
  if (shortcut) {
    await page.keyboard.down("Control");
    await page.keyboard.down("m");
  } else {
    const rect = await page.locator(".telegraph-key").boundingBox();
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await page.mouse.down();
  }
  await expect(page.locator(".telegraph-key")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.clock.fastForward(symbol === "-" ? MORSE_DASH + 70 : 70);
  if (shortcut) {
    await page.keyboard.up("m");
    await page.keyboard.up("Control");
  } else await page.mouse.up();
  await page.clock.fastForward(70);
}

test("standalone telegraph has static metadata and the exact supplied 1200×630 cover", async ({
  request,
}) => {
  for (const route of ["/telegraph", "/telegraph/"]) {
    const response = await request.get(route);
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toContain("Телеграф Tyter — написать телеграмму");
    expect(html).toMatch(
      /property="og:image"\s+content="https:\/\/tyterapp.github.io\/telegraph\/cover-white-v1.png"/,
    );
    expect(html).toContain(
      'rel="canonical" href="https://tyterapp.github.io/telegraph/"',
    );
  }
  const response = await request.get("/telegraph/cover.png");
  expect(response.status()).toBe(200);
  const png = await response.body();
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
  const supplied = await readFile(
    new URL("../../public/telegraph/cover-white-v1.png", import.meta.url),
  );
  expect(png.equals(supplied)).toBe(true);
  const versioned = await request.get("/telegraph/cover-white-v1.png");
  expect(versioned.status()).toBe(200);
  expect((await versioned.body()).equals(supplied)).toBe(true);
  expect((await request.get("/telegraph/normal.png")).status()).toBe(200);
  expect(await (await request.get("/sitemap.xml")).text()).toContain(
    "<loc>https://tyterapp.github.io/telegraph</loc>",
  );
});

for (const theme of ["light", "dark"])
  test(`${theme}: standalone page starts at the caret, types and pastes plain text, shares the whole telegram and keeps an isolated draft`, async ({
    page,
  }, info) => {
    await open(page, { theme });
    const document = page.locator(".telegraph-document");
    await expect(document).toHaveCSS("font-family", /Courier/);
    await expect(page.getByRole("button")).toHaveCount(6);
    const logo = await page.locator(".telegraph-composer-logo").boundingBox();
    const paper = await page.locator(".telegraph-compose-paper").boundingBox();
    expect(Math.abs(logo.x - paper.x)).toBeLessThan(1);
    const languages = await page
      .locator(".telegraph-composer-header .language-switch")
      .boundingBox();
    expect(
      Math.abs(languages.x + languages.width - paper.x - paper.width),
    ).toBeLessThan(1);
    await expect(
      page.locator(
        ".workspace-tools,.minimal-header,.screenplay-format-bar,.site-nav",
      ),
    ).toHaveCount(0);
    const share = page.getByRole("button", {
      name: "Share telegram",
      exact: true,
    });
    await expect(share).toBeDisabled();
    await page.keyboard.type("HELLO");
    await page.keyboard.press("Control+b");
    await page.keyboard.type("!");
    await page.keyboard.press("Enter");
    await paste(page, "One\nTwo");
    await expect(document).toContainText("HELLO!");
    await expect(document).toContainText("One");
    await expect(document.locator("b,strong,h1,h2,a,ul,ol")).toHaveCount(0);
    await expect(document).not.toContainText("UNWANTED FORMATTING");
    const draft = await page.evaluate(() =>
      localStorage.getItem("tyter.telegraph-draft.v1"),
    );
    expect(draft).toBe("HELLO!\nOne\nTwo");
    expect(
      await page.evaluate(() => localStorage.getItem("tyter.projects.v1")),
    ).toBe("[]");
    await page.screenshot({
      path: info.outputPath(`telegraph-composer-${theme}.png`),
    });
    await share.click();
    const dialog = page.getByRole("dialog", { name: "Share telegram" });
    await expect(dialog).toBeVisible();
    expect(
      readTelegram(new URL(await dialog.getByRole("textbox").inputValue()).hash)
        .text,
    ).toBe(draft);
    await expect(dialog.locator(".telegram-cover-preview")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.reload();
    await expect(document).toBeFocused();
    await expect
      .poll(() =>
        page.evaluate(() => localStorage.getItem("tyter.telegraph-draft.v1")),
      )
      .toBe(draft);
    await expect(document).toContainText("Two");
  });

test("standalone Morse and Ctrl+M replace the active selection and retain native Undo", async ({
  page,
}) => {
  await open(page);
  await page.keyboard.type("ABCD");
  await page.locator(".telegraph-document p").evaluate((node) => {
    const range = document.createRange();
    range.setStart(node.firstChild, 1);
    range.setEnd(node.firstChild, 3);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
  });
  await expect
    .poll(() => page.evaluate(() => getSelection().toString()))
    .toBe("BC");
  const time = Date.now();
  await page.clock.install({ time });
  await page.clock.pauseAt(time + 1000);
  await signal(page);
  await page.clock.fastForward(MORSE_LETTER_GAP);
  await expect(page.locator(".telegraph-document")).toHaveText("AED");
  await expect(page.locator(".telegraph-document .telegraph-text")).toHaveText(
    "E",
  );
  await page.keyboard.press("Control+z");
  await expect(page.locator(".telegraph-document")).toHaveText("ABCD");
  await page.keyboard.press("Control+Shift+z");
  await expect(page.locator(".telegraph-document")).toHaveText("AED");
  await signal(page, ".", true);
  await page.clock.fastForward(MORSE_LETTER_GAP);
  await expect(page.locator(".telegraph-document")).toHaveText("AEED");
});

test("standalone telegraph inherits the Russian alphabet and accepts held dashes", async ({
  page,
}) => {
  await open(page, { language: "ru" });
  const time = Date.now();
  await page.clock.install({ time });
  await page.clock.pauseAt(time + 1000);
  await signal(page, ".");
  await signal(page, "-");
  await page.clock.fastForward(MORSE_LETTER_GAP);
  await expect(page.locator(".telegraph-document")).toHaveText("А");
});

test.describe("touch-only standalone composer", () => {
  test.use({ hasTouch: true, isMobile: true });
  for (const [width, height] of [
    [320, 844],
    [844, 390],
  ])
    test(`${width}×${height}: no keyboard input, native context menu is not intercepted, paste and touch Morse remain usable`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height });
      await open(page);
      const logo = await page.locator(".telegraph-composer-logo").boundingBox();
      expect(logo.x).toBe(16);
      for (const control of await page
        .locator(".telegraph-composer-header button")
        .all()) {
        const rect = await control.boundingBox();
        expect(rect.width).toBeGreaterThanOrEqual(44);
        expect(rect.height).toBeGreaterThanOrEqual(44);
        expect(rect.x).toBeGreaterThanOrEqual(0);
        expect(rect.x + rect.width).toBeLessThanOrEqual(width);
      }
      const document = page.locator(".telegraph-document");
      await expect(document).toHaveAttribute("inputmode", "none");
      await expect(document).toHaveAttribute("virtualkeyboardpolicy", "manual");
      await document.tap();
      await expect(document).toBeFocused();
      await page.keyboard.type("BLOCKED");
      await expect(document).toHaveText("");
      await paste(page, "PASTE");
      await expect(document).toHaveText("PASTE");
      const menuAllowed = await document.evaluate((node) =>
        node.dispatchEvent(
          new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
        ),
      );
      expect(menuAllowed).toBe(true);
      await page.locator(".telegraph-key").tap();
      await expect(document).toHaveText("PASTEE");
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      const key = await page.locator(".focus-telegraph").boundingBox();
      expect(key.y + key.height).toBeLessThanOrEqual(height);
      const paper = await page
        .locator(".telegraph-compose-scroll")
        .boundingBox();
      expect(paper.y + paper.height).toBeLessThanOrEqual(key.y + 12);
      await page.screenshot({
        path: info.outputPath(`telegraph-touch-${width}.png`),
      });
    });
});

test("long telegrams scroll inside the paper and keep the caret above the key", async ({
  page,
}) => {
  await open(page);
  await paste(
    page,
    Array.from({ length: 75 }, (_, index) => `Line ${index}`).join("\n"),
  );
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" LAST");
  await expect
    .poll(() =>
      page
        .locator(".telegraph-compose-scroll")
        .evaluate((node) => node.scrollTop),
    )
    .toBeGreaterThan(100);
  const caret = await page.evaluate(
    () => getSelection().getRangeAt(0).getBoundingClientRect().bottom,
  );
  const key = await page.locator(".focus-telegraph").boundingBox();
  expect(caret).toBeLessThan(key.y);
  await expect(
    page.getByRole("button", { name: "Share telegram", exact: true }),
  ).toBeVisible();
});

for (const language of ["en", "ru"])
  test(`standalone ${language}: both complete Morse alphabets, focus containment and all close actions`, async ({
    page,
  }, info) => {
    if (language === "ru")
      await page.setViewportSize({ width: 320, height: 844 });
    await open(page, { language, theme: language === "ru" ? "dark" : "light" });
    await paste(page, "KEEP THIS");
    const help = page.locator(".telegraph-help-button");
    await help.click();
    const dialog = page.getByRole("dialog", {
      name: language === "en" ? "Morse alphabet" : "Азбука Морзе",
    });
    await expect(dialog).toBeVisible();
    await expect(help).toHaveAttribute("aria-expanded", "true");
    await expect(dialog.locator('dl[lang="ru"] .telegraph-letter')).toHaveCount(
      33,
    );
    await expect(dialog.locator('dl[lang="en"] .telegraph-letter')).toHaveCount(
      26,
    );
    for (const [letter, code] of [
      ["Ё", "."],
      ["Я", ".-.-"],
      ["Ъ", "--.--"],
      ["A", ".-"],
      ["Z", "--.."],
    ])
      await expect(
        dialog.locator(`[data-letter="${letter}"] dd .visually-hidden`),
      ).toHaveText(code);
    await page.keyboard.press("Control+m");
    await page.waitForTimeout(MORSE_LETTER_GAP + 100);
    await expect(page.locator(".telegraph-document")).toHaveText("KEEP THIS");
    await page.keyboard.press("Tab");
    expect(
      await dialog.evaluate((node) => node.contains(document.activeElement)),
    ).toBe(true);
    const content = dialog.locator(".telegraph-alphabet-content");
    await content.evaluate((node) => (node.scrollTop = node.scrollHeight));
    await expect(dialog.locator('[data-letter="Z"]')).toBeInViewport();
    expect(
      await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`alphabet-${language}.png`),
    });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(help).toBeFocused();
    await help.click();
    await page.mouse.click(2, 2);
    await expect(dialog).toHaveCount(0);
    await help.click();
    await dialog
      .getByRole("button", { name: language === "en" ? "Close" : "Закрыть" })
      .click();
    await expect(dialog).toHaveCount(0);
  });

test("standalone language switch preserves writing and changes the Morse decoding alphabet", async ({
  page,
}) => {
  await open(page);
  await page.keyboard.type("HELLO");
  await page.getByRole("button", { name: "RU", exact: true }).click();
  await expect(page.locator(".telegraph-document")).toBeFocused();
  await expect(
    page.getByRole("button", { name: "RU", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("main")).toHaveAttribute("lang", "ru");
  expect(
    await page.evaluate(() => localStorage.getItem("tyter.language.v1")),
  ).toBe("ru");
  const time = Date.now();
  await page.clock.install({ time });
  await page.clock.pauseAt(time + 1000);
  await signal(page);
  await signal(page, "-");
  await page.clock.fastForward(MORSE_LETTER_GAP);
  await expect(page.locator(".telegraph-document")).toHaveText("HELLOА");
  await page.getByRole("button", { name: "ENG", exact: true }).click();
  await signal(page);
  await signal(page, "-");
  await page.clock.fastForward(MORSE_LETTER_GAP);
  await expect(page.locator(".telegraph-document")).toHaveText("HELLOАA");
  expect(
    await page.evaluate(() => localStorage.getItem("tyter.language.v1")),
  ).toBe("en");
});

test("standalone logo has the editor brand menu and left click returns home", async ({
  page,
}) => {
  await open(page);
  const logo = page.locator(".telegraph-composer-logo");
  await expect(logo).toHaveAttribute("href", "/");
  await logo.click({ button: "right" });
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem")).toHaveCount(3);
  for (const id of ["brandbook", "guidelines", "ui-kit"])
    await expect(menu.locator(`a[href="/design#${id}"]`)).toHaveAttribute(
      "target",
      "_blank",
    );
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await logo.focus();
  await page.keyboard.press("Shift+F10");
  await expect(menu).toBeVisible();
  await page.locator(".telegraph-document").click();
  await expect(menu).toHaveCount(0);
  await logo.click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".telegraph-document")).toHaveCount(0);
});

for (const mode of ["vibration", "blocked", "unsupported"])
  test(`standalone ${mode} haptics: one feedback per press, no repeated keydown or input failures`, async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript((mode) => {
      window.hapticCalls = [];
      Object.defineProperty(navigator, "vibrate", {
        configurable: true,
        value:
          mode !== "unsupported"
            ? (value) => {
                if (value !== 0) window.hapticCalls.push(value);
                if (mode === "blocked") throw new Error("Haptics unavailable");
                return true;
              }
            : undefined,
      });
    }, mode);
    await open(page);
    const time = Date.now();
    await page.clock.install({ time });
    await page.clock.pauseAt(time + 1000);
    await signal(page);
    await page.clock.fastForward(MORSE_LETTER_GAP);
    await page.keyboard.down("Control");
    await page.keyboard.down("m");
    await page.keyboard.down("m");
    await page.clock.fastForward(70);
    await page.keyboard.up("m");
    await page.keyboard.up("Control");
    await page.clock.fastForward(MORSE_LETTER_GAP);
    await expect(page.locator(".telegraph-document")).toHaveText("EE");
    const calls = await page.evaluate(() => window.hapticCalls);
    expect(calls).toHaveLength(mode === "unsupported" ? 0 : 2);
    if (mode !== "unsupported") expect(calls).toEqual([[12], [12]]);
    expect(errors).toEqual([]);
  });

test("standalone home-screen icons and manifest are scoped to telegraph", async ({
  request,
}) => {
  const html = await (await request.get("/telegraph/")).text();
  expect(html).toContain(
    'rel="icon" type="image/png" sizes="32x32" href="/telegraph/favicon-32.png"',
  );
  expect(html).toContain(
    'rel="apple-touch-icon" sizes="180x180" href="/telegraph/apple-touch-icon.png"',
  );
  expect(html).toContain(
    'rel="manifest" href="/telegraph/manifest.webmanifest"',
  );
  expect(html).toContain('name="apple-mobile-web-app-capable" content="yes"');
  const response = await request.get("/telegraph/manifest.webmanifest");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain(
    "application/manifest+json",
  );
  const manifest = await response.json();
  expect(manifest).toMatchObject({
    id: "/telegraph/",
    start_url: "/telegraph/",
    scope: "/telegraph/",
    display: "standalone",
  });
  for (const [src, size] of [
    ["/telegraph/favicon-32.png", 32],
    ["/telegraph/apple-touch-icon.png", 180],
    ...manifest.icons.map((icon) => [
      icon.src,
      Number(icon.sizes.split("x")[0]),
    ]),
  ]) {
    const image = await request.get(src);
    expect(image.status()).toBe(200);
    expect(image.headers()["content-type"]).toContain("image/png");
    const data = await image.body();
    expect([data.readUInt32BE(16), data.readUInt32BE(20)]).toEqual([
      size,
      size,
    ]);
  }
  expect(manifest.icons.some((icon) => icon.purpose === "maskable")).toBe(true);
  for (const route of ["/", "/free/", "/pro/", "/telegram/"]) {
    const other = await (await request.get(route)).text();
    expect(other).toContain(
      'rel="icon" type="image/svg+xml" href="/brand/tyter-logo.svg"',
    );
    expect(other).not.toContain("/telegraph/manifest.webmanifest");
  }
});

test.describe("standalone mobile haptics", () => {
  test.use({ hasTouch: true, isMobile: true });
  test("Android waits for touch-up activation and never vibrates cancelled touches", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      window.mobileHaptics = [];
      window.touchUpSeen = false;
      document.addEventListener(
        "pointerup",
        () => (window.touchUpSeen = true),
        true,
      );
      Object.defineProperty(navigator, "playHaptics", {
        configurable: true,
        value: undefined,
      });
      Object.defineProperty(navigator, "vibrate", {
        configurable: true,
        value: (value) => {
          window.mobileHaptics.push({ value, activated: window.touchUpSeen });
          return window.touchUpSeen;
        },
      });
    });
    await open(page);
    await expect(page.locator(".telegraph-native-haptic")).toHaveCount(0);
    await page.locator(".telegraph-key").tap();
    await expect(page.locator(".telegraph-document")).toHaveText("E");
    expect(await page.evaluate(() => window.mobileHaptics)).toEqual([
      { value: [25], activated: true },
    ]);
    await page.locator(".telegraph-key").dispatchEvent("pointerdown", {
      pointerId: 9,
      pointerType: "touch",
      button: 0,
    });
    await page
      .locator(".telegraph-key")
      .dispatchEvent("pointercancel", { pointerId: 9, pointerType: "touch" });
    expect(await page.evaluate(() => window.mobileHaptics.length)).toBe(1);
  });
  test("iOS uses a trusted native switch tap and keeps Morse timing, selection and keyboard accessibility", async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "userAgent", {
        configurable: true,
        value:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 26_5 like Mac OS X) AppleWebKit/605.1.15 Version/26.5 Mobile Safari/604.1",
      });
      Object.defineProperty(navigator, "vibrate", {
        configurable: true,
        value: undefined,
      });
      Object.defineProperty(navigator, "playHaptics", {
        configurable: true,
        value: undefined,
      });
      // Emulate capability detection, not a physical Taptic Engine, in Edge.
      Object.defineProperty(HTMLInputElement.prototype, "switch", {
        configurable: true,
        get() {
          return this.hasAttribute("switch");
        },
      });
      window.nativeTaps = [];
      document.addEventListener("click", (event) => {
        if (event.target.matches(".telegraph-native-haptic"))
          window.nativeTaps.push({
            trusted: event.isTrusted,
            checked: event.target.checked,
          });
      });
    });
    await open(page);
    const input = page.locator(".telegraph-native-haptic");
    await expect(input).toHaveCount(1);
    await expect(input).toHaveCSS("opacity", "0");
    await expect(input).not.toHaveCSS("appearance", "none");
    await expect(input).toHaveAttribute("tabindex", "-1");
    await expect(input).toHaveAttribute("aria-hidden", "true");
    const inputBox = await input.boundingBox();
    const keyBox = await page.locator(".telegraph-key").boundingBox();
    expect(inputBox).toEqual(keyBox);
    const time = Date.now();
    await page.clock.install({ time });
    await page.clock.pauseAt(time + 1000);
    await input.tap();
    await page.clock.fastForward(MORSE_LETTER_GAP);
    await expect(page.locator(".telegraph-document")).toHaveText("E");
    await expect(page.locator(".telegraph-document")).toBeFocused();
    expect(await page.evaluate(() => window.nativeTaps)).toEqual([
      { trusted: true, checked: true },
    ]);
    await input.dispatchEvent("pointerdown", {
      pointerId: 7,
      pointerType: "touch",
      button: 0,
    });
    await page.clock.fastForward(MORSE_DASH + 40);
    await expect(page.locator(".telegraph-key")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await input.dispatchEvent("pointerup", {
      pointerId: 7,
      pointerType: "touch",
    });
    await page.clock.fastForward(MORSE_LETTER_GAP);
    await expect(page.locator(".telegraph-document")).toHaveText("ET");
    await input.dispatchEvent("pointerdown", {
      pointerId: 8,
      pointerType: "touch",
      button: 0,
    });
    await input.dispatchEvent("pointercancel", {
      pointerId: 8,
      pointerType: "touch",
    });
    await page.clock.fastForward(MORSE_LETTER_GAP);
    await expect(page.locator(".telegraph-document")).toHaveText("ET");
    await page.locator(".telegraph-key").focus();
    await page.keyboard.down("Space");
    await page.clock.fastForward(60);
    await page.keyboard.up("Space");
    await page.clock.fastForward(MORSE_LETTER_GAP);
    await expect(page.locator(".telegraph-document")).toHaveText("ETE");
    await page.screenshot({ path: info.outputPath("telegraph-ios-path.png") });
  });
});

test("standalone X crawler receives static card tags and a fresh JPEG while Open Graph keeps the original PNG", async ({
  request,
}) => {
  for (const route of [
    "/telegraph",
    "/telegraph/",
    "/telegraph/?share=20261021",
  ]) {
    const response = await request.get(route, {
      headers: { "User-Agent": "Twitterbot/1.0" },
    });
    expect(response.status()).toBe(200);
    const html = await response.text();
    for (const [name, value] of [
      ["twitter:card", "summary_large_image"],
      ["twitter:image", "https://tyterapp.github.io/telegraph/cover-x-v2.jpg"],
      ["og:image", "https://tyterapp.github.io/telegraph/cover-white-v1.png"],
      ["og:url", "https://tyterapp.github.io/telegraph/"],
    ]) {
      const tags = html.match(
        new RegExp(
          `<meta\\s+(?:name|property)="${name}"\\s+content="([^"]*)"\\s*/?>`,
          "g",
        ),
      );
      expect(tags).toHaveLength(1);
      expect(tags[0]).toContain(value);
      expect(html.indexOf(tags[0])).toBeLessThan(html.indexOf("</head>"));
    }
  }
  const response = await request.get("/telegraph/cover-x-v2.jpg", {
    headers: { "User-Agent": "Twitterbot/1.0" },
  });
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("image/jpeg");
  const body = await response.body();
  expect(body.length).toBeLessThan(100000);
  const image = await loadImage(body);
  expect([image.width, image.height]).toEqual([1200, 630]);
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toMatch(/User-agent:\s*\*[\s\S]*Allow:\s*\//);
  expect(robots).not.toMatch(/Disallow:\s*\/\s/);
});

test("standalone Delete removes the final grapheme and line break, supports Undo and updates the shared snapshot", async ({
  page,
}) => {
  await open(page);
  const draft = () =>
    page.evaluate(() => localStorage.getItem("tyter.telegraph-draft.v1"));
  const remove = page.getByRole("button", {
    name: "Delete last character",
    exact: true,
  });
  await expect(remove).toBeDisabled();
  await paste(page, "A\nB👩‍👩‍👧‍👦e\u0301");
  // Deleting always targets the end, even when the caret was left elsewhere.
  await page.keyboard.press("Control+Home");
  await remove.click();
  await expect(page.locator(".telegraph-document")).toHaveText("AB👩‍👩‍👧‍👦");
  expect(
    await page.evaluate(() => localStorage.getItem("tyter.telegraph-draft.v1")),
  ).toBe("A\nB👩‍👩‍👧‍👦");
  await page.keyboard.press("Control+z");
  expect(await draft()).toBe("A\nB👩‍👩‍👧‍👦e\u0301");
  await page.keyboard.press("Control+Shift+z");
  await remove.click();
  expect(await draft()).toBe("A\nB");
  await remove.click();
  expect(await draft()).toBe("A\n");
  await remove.click();
  expect(await text(page)).toBe("A");
  await page
    .getByRole("button", { name: "Share telegram", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Share telegram" });
  expect(
    readTelegram(new URL(await dialog.getByRole("textbox").inputValue()).hash)
      .text,
  ).toBe("A");
  await page.keyboard.press("Escape");
  await remove.click();
  await expect(remove).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Share telegram", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Control+z");
  expect(await text(page)).toBe("A");
});

test("standalone Delete cancels a pending Morse letter so it cannot reappear after erasing", async ({
  page,
}) => {
  await open(page);
  await page.keyboard.type("ABC");
  const time = Date.now();
  await page.clock.install({ time });
  await page.clock.pauseAt(time + 1000);
  await signal(page);
  await page
    .getByRole("button", { name: "Delete last character", exact: true })
    .click();
  await page.clock.fastForward(MORSE_LETTER_GAP * 3);
  await expect(page.locator(".telegraph-document")).toHaveText("AB");
  await expect(page.locator(".telegraph-key")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});

test.describe("standalone mobile Delete", () => {
  test.use({ hasTouch: true, isMobile: true });
  test("320px: tap erases one character without opening the keyboard or moving the controls offscreen", async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await open(page, { language: "ru" });
    await paste(page, "ТЕСТ");
    const remove = page.getByRole("button", {
      name: "Удалить последний символ",
      exact: true,
    });
    await remove.tap();
    await expect(page.locator(".telegraph-document")).toHaveText("ТЕС");
    await expect(page.locator(".telegraph-document")).toBeFocused();
    await expect(page.locator(".telegraph-document")).toHaveAttribute(
      "inputmode",
      "none",
    );
    // Measure the resting target after the intentional press-scale transition.
    await expect
      .poll(async () => (await remove.boundingBox()).width)
      .toBeGreaterThanOrEqual(43.99);
    const box = await remove.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(43.99);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(320);
    await page.screenshot({
      path: info.outputPath("telegraph-delete-mobile.png"),
    });
  });
});

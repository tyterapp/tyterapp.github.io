import { test, expect } from "@playwright/test";
import { createProject } from "../../src/data.js";
import { selectAppOption } from "../helpers/app-select.js";

test.beforeEach(async ({ context }) => {
  await context.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
});

test("license has a static page, canonical metadata and a sitemap entry; original font assets include the OFL", async ({
  request,
}) => {
  const page = await request.get("/license/");
  expect(page.status()).toBe(200);
  const html = await page.text();
  expect(html).toContain("Лицензия и пользовательское соглашение — Tyter");
  expect(html).toContain(
    'rel="canonical" href="https://tyterapp.github.io/license"',
  );
  expect(await (await request.get("/sitemap.xml")).text()).toContain(
    "https://tyterapp.github.io/license",
  );
  for (const name of ["Regular", "Bold"]) {
    const font = await request.get(
      `/fonts/marginalis/Marginalis-${name}.woff2`,
    );
    expect(font.status()).toBe(200);
    expect((await font.body()).subarray(0, 4).toString()).toBe("wOF2");
  }
  expect(
    await (await request.get("/fonts/marginalis/OFL.txt")).text(),
  ).toContain("Copyright 2026 Dmitrii Osadchuk");
});

for (const language of ["ru", "en"])
  test(`${language}: Marginalis applies only to scene headings, follows format changes and persists after reload`, async ({
    page,
  }) => {
    const doc = createProject("Marginalis");
    doc.id = "marginalis-document";
    doc.content.content = [
      {
        type: "paragraph",
        attrs: { format: "scene", blockId: "scene" },
        content: [{ type: "text", text: "ИНТ. ДОМ — ДЕНЬ / INT. ROOM — DAY" }],
      },
      {
        type: "paragraph",
        attrs: { format: "action", blockId: "action" },
        content: [{ type: "text", text: "Русский текст. English text. 123" }],
      },
      ...["character", "speech", "parenthetical", "transition", "plain"].map(
        (format) => ({
          type: "paragraph",
          attrs: { format, blockId: format },
          content: [{ type: "text", text: "Русский текст. English text." }],
        }),
      ),
    ];
    await page.addInitScript(
      ({ doc, language }) => {
        if (sessionStorage.getItem("marginalis-seed")) return;
        sessionStorage.setItem("marginalis-seed", "1");
        localStorage.setItem("tyter.projects.v1", JSON.stringify([doc]));
        localStorage.setItem("tyter.active", doc.id);
        localStorage.setItem("tyter.language.v1", language);
        localStorage.setItem("tyter.editor-intro.v1", "seen");
        localStorage.setItem("tyter.onboarding.v1", "done");
      },
      { doc, language },
    );
    await page.goto("/free");
    const editor = page.locator(".screenplay-editor");
    await expect(editor).toBeVisible();
    const before = await editor.evaluate((node) => node.editor.getText());
    await page
      .getByRole("button", {
        name: language === "en" ? "Document settings" : "Настройки документа",
        exact: true,
      })
      .click();
    const font = page.getByRole("combobox", {
      name: language === "en" ? "Editor font" : "Шрифт в редакторе",
      exact: true,
    });
    await selectAppOption(page, font, "marginalis");
    const heading = editor.locator('[data-block-id="scene"]');
    const action = editor.locator('[data-block-id="action"]');
    await expect(heading).toHaveCSS("font-family", /Marginalis/);
    await expect(editor).toHaveCSS(
      "font-family",
      /Screenplay Courier Cyrillic/,
    );
    for (const format of [
      "action",
      "character",
      "speech",
      "parenthetical",
      "transition",
      "plain",
    ])
      await expect(editor.locator(`[data-block-id="${format}"]`)).toHaveCSS(
        "font-family",
        /Screenplay Courier Cyrillic/,
      );
    const faces = await page.evaluate(async () => {
      const loaded = [];
      for (const weight of [400, 700])
        loaded.push(
          ...(await document.fonts.load(
            `${weight} 16px "Marginalis"`,
            "Русский English",
          )),
        );
      return loaded.map((font) => ({
        weight: font.weight,
        status: font.status,
      }));
    });
    expect(faces).toEqual(
      expect.arrayContaining([
        { weight: "400", status: "loaded" },
        { weight: "700", status: "loaded" },
      ]),
    );
    expect(await editor.evaluate((node) => node.editor.getText())).toBe(before);
    await action.click();
    await page.keyboard.press("Control+1");
    await expect(action).toHaveCSS("font-family", /Marginalis/);
    await page.keyboard.press("Control+2");
    await expect(action).toHaveCSS(
      "font-family",
      /Screenplay Courier Cyrillic/,
    );
    await selectAppOption(page, font, "georgia");
    await expect(heading).toHaveCSS("font-family", /Georgia/);
    await expect(action).toHaveCSS("font-family", /Georgia/);
    await selectAppOption(page, font, "marginalis");
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            JSON.parse(localStorage.getItem("tyter.projects.v1"))[0].metadata
              .fontFamily,
        ),
      )
      .toBe("marginalis");
    await page.reload();
    await expect(heading).toHaveCSS("font-family", /Marginalis/);
    await expect(action).toHaveCSS(
      "font-family",
      /Screenplay Courier Cyrillic/,
    );
    expect(await editor.evaluate((node) => node.editor.getText())).toBe(before);
    await page.screenshot({ path: `.cache/marginalis-${language}.png` });
  });

test("320px: a saved Marginalis document uses Courier for dialogue and action", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  const doc = createProject("Marginalis mobile");
  doc.id = "marginalis-mobile";
  doc.metadata.fontFamily = "marginalis";
  doc.content.content = ["scene", "action", "character", "speech"].map(
    (format) => ({
      type: "paragraph",
      attrs: { format, blockId: format },
      content: [{ type: "text", text: "Текст Text" }],
    }),
  );
  await page.addInitScript((doc) => {
    localStorage.setItem("tyter.projects.v1", JSON.stringify([doc]));
    localStorage.setItem("tyter.active", doc.id);
    localStorage.setItem("tyter.onboarding.v1", "done");
    localStorage.setItem("tyter.editor-intro.v1", "seen");
    localStorage.setItem("tyter.language.v1", "ru");
  }, doc);
  await page.goto("/free");
  const editor = page.locator(".screenplay-editor");
  await expect(editor.locator('[data-format="scene"]')).toHaveCSS(
    "font-family",
    /Marginalis/,
  );
  for (const format of ["action", "character", "speech"])
    await expect(editor.locator(`[data-format="${format}"]`)).toHaveCSS(
      "font-family",
      /Screenplay Courier Cyrillic/,
    );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
  ).toBe(0);
});

for (const [theme, width] of [
  ["light", 1440],
  ["dark", 320],
])
  test(`${theme} ${width}px: landing copyright and top-right legal switch open both documents and support Back`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width < 832 ? 844 : 1000 });
    await page.addInitScript((theme) => {
      if (sessionStorage.getItem("license-seeded")) return;
      sessionStorage.setItem("license-seeded", "1");
      localStorage.setItem("tyter.language.v1", "ru");
      localStorage.setItem(
        "tyter.editor-preferences.v1",
        JSON.stringify({ theme }),
      );
    }, theme);
    await page.goto("/");
    const control = page.getByRole("navigation", {
      name: "Правовые документы",
    });
    await expect(control).toBeVisible();
    const bounds = await control.boundingBox();
    expect(bounds.y).toBeLessThan(60);
    expect(bounds.x + bounds.width).toBeGreaterThan(width - 60);
    const copyright = page.locator(".site-copyright");
    await expect(copyright).toHaveText("©");
    await copyright.click();
    await expect(page.locator(".legal-document")).toHaveAccessibleName(
      "Лицензия приложения",
    );
    await control
      .getByRole("link", { name: "Пользовательское соглашение", exact: true })
      .click();
    await expect(page.locator(".legal-document")).toHaveAccessibleName(
      "Пользовательское соглашение",
    );
    await expect(page.locator(".legal-document")).toContainText(
      "Сервис не сохраняет пользовательские документы на своих серверах",
    );
    await expect(page.locator(".legal-document")).toContainText(
      "локальные файлы пользователя",
    );
    await expect(page.locator(".legal-document")).toContainText(
      "локальном хранилище браузера",
    );
    await page.reload();
    await expect(page.locator(".legal-document")).toHaveAccessibleName(
      "Пользовательское соглашение",
    );
    await expect(
      page.getByRole("link", {
        name: "Пользовательское соглашение",
        exact: true,
      }),
    ).toHaveAttribute("aria-current", "page");
    await page.goBack();
    await expect(page.locator(".legal-document")).toHaveAccessibleName(
      "Лицензия приложения",
    );
    await page.getByRole("button", { name: "ENG", exact: true }).click();
    await expect(page.locator(".legal-document")).toHaveAccessibleName(
      "Application license",
    );
    await page
      .getByRole("link", { name: "User agreement", exact: true })
      .click();
    await expect(page.locator(".legal-document")).toContainText(
      "The service does not save user documents on its servers",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBe(0);
    await page.screenshot({ path: `.cache/license-${theme}-${width}.png` });
  });

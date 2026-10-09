import { test, expect } from "@playwright/test";
import { createProject } from "../src/data.js";
import {
  inspectScript,
  inspectDocumentScript,
  doctorCondition,
} from "../src/script-doctor.js";
import { switchScriptVersion } from "../src/script-versions.js";
import { grantPro } from "./helpers/pro-access.js";
import { selectAppOption } from "./helpers/app-select.js";

const p = (format, text, blockId) => ({
  type: "paragraph",
  attrs: { format, blockId },
  ...(text ? { content: [{ type: "text", text }] } : {}),
});
function fixture(scenes = 3) {
  const doc = createProject("Проверка доктора");
  doc.id = "script-doctor-test";
  doc.content.content = Array.from({ length: scenes }, (_, i) => [
    p("scene", `МЕСТО ${i + 1}`, `scene-${i + 1}`),
    p("action", `Действие номер ${i + 1}.`, `action-${i + 1}`),
  ]).flat();
  return doc;
}
async function open(page, doc = fixture(), theme = "light", pro = false) {
  if (pro) await grantPro(page);
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  await page.addInitScript(
    ({ doc, theme }) => {
      localStorage.setItem("tyter.onboarding.v1", "done");
      if (sessionStorage.getItem("doctor-seeded")) return;
      localStorage.setItem("tyter.projects.v1", JSON.stringify([doc]));
      localStorage.setItem("tyter.active", doc.id);
      localStorage.setItem("tyter.language.v1", "ru");
      localStorage.setItem(
        "tyter.editor-preferences.v1",
        JSON.stringify({ theme }),
      );
      sessionStorage.setItem("doctor-seeded", "yes");
    },
    { doc, theme },
  );
  await page.goto(pro ? "/beta" : "/free");
  await expect(page.locator(".screenplay-editor")).toBeFocused();
}
async function replace(page, id, text) {
  await page.locator(`p[data-block-id="${id}"]`).evaluate((node) => {
    node.closest("[contenteditable]").focus();
    const range = document.createRange();
    range.selectNodeContents(node);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
  });
  await page.keyboard.insertText(text);
}
const icon = (page) => page.locator(".script-doctor-icon");
const button = (page) =>
  page.getByRole("button", { name: "Доктор сценария", exact: true });
const stored = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("tyter.projects.v1"))[0]);

test("doctor identifies format errors without flagging valid mixed headings or repeat locations", () => {
  const valid = [
    "INT. / EXT. CAR — DAY",
    "I/E. CAR — NIGHT",
    "ПАВ. ДОМ — УТРО",
    "EST. CITY — DAWN",
  ];
  expect(
    inspectScript({
      content: valid.flatMap((text, i) => [
        p("scene", text, `s${i}`),
        p("action", `Different action ${i}`, `a${i}`),
      ]),
    }),
  ).toEqual([]);
  const findings = inspectScript({
    content: [
      p("action", "ИНТ. ДОМ — ДЕНЬ", "a"),
      p("parenthetical", "тихо", "aside"),
      p("speech", "Здравствуйте", "speech"),
      p("character", "АННА", "anna"),
    ],
  });
  expect(findings.map((f) => f.title)).toEqual([
    "Неверный формат заголовка",
    "Ремарка без персонажа",
    "Ремарка без скобок",
    "Реплика без персонажа",
    "Персонаж без реплики",
  ]);
  expect(
    inspectScript({
      content: [
        p("scene", "INT. HOUSE — DAY", "s1"),
        p("action", "First action", "a1"),
        p("scene", "INT. HOUSE — DAY", "s2"),
        p("action", "Second action", "a2"),
      ],
    }),
  ).toEqual([]);
});

test("doctor reads live scene variants, isolates screenplay versions and avoids duplicate variant copies", () => {
  const doc = fixture(1);
  doc.content.content[0] = p("scene", "ИНТ. ДОМ — ДЕНЬ", "scene-1");
  doc.sceneVariants = {
    "scene-1": {
      A: [p("scene", "Устаревший снимок", "scene-1")],
      B: structuredClone(doc.content.content),
      F: [
        p("scene", "ЭКС. САД", "scene-1"),
        p("speech", "Без персонажа", "f-speech"),
      ],
    },
  };
  doc.scriptVersions = {
    blue: { content: { content: [p("scene", "Другие ошибки", "foreign")] } },
  };
  const before = JSON.stringify(doc);
  const findings = inspectDocumentScript(doc);
  expect(findings).toHaveLength(2);
  expect(
    findings.every(
      (f) =>
        f.variant === "F" && f.sceneId === "scene-1" && f.sceneNumber === 1,
    ),
  ).toBe(true);
  expect(JSON.stringify(doc)).toBe(before);
  doc.content.content.push(
    p("scene", "ИНТ. ДОМ — ДЕНЬ", "scene-2"),
    p("action", "Действие номер 1.", "second-action"),
  );
  const duplicates = inspectDocumentScript(doc).filter(
    (f) => f.kind === "duplicates",
  );
  expect(duplicates).toHaveLength(1);
  expect(duplicates[0].sceneNumber).toBe(2);
});

test("visual severity grows, recedes and bounds particles while retaining the complete error count", () => {
  expect(doctorCondition(0)).toEqual({ errors: 0, fill: 0, flies: 0 });
  expect(doctorCondition(1)).toEqual({ errors: 1, fill: 1 / 12, flies: 1 });
  expect(doctorCondition(6)).toEqual({ errors: 6, fill: 0.5, flies: 6 });
  expect(doctorCondition(12)).toEqual({ errors: 12, fill: 1, flies: 12 });
  expect(doctorCondition(1000)).toEqual({ errors: 1000, fill: 1, flies: 24 });
  expect(doctorCondition(-1)).toEqual(doctorCondition(0));
});

for (const theme of ["light", "dark"]) {
  test(`doctor is readable and clickable in ${theme}, opens findings and navigates without mutating text`, async ({
    page,
  }, info) => {
    await open(page, fixture(6), theme);
    await expect(icon(page)).toHaveAttribute("data-error-count", "12");
    await expect(icon(page)).toHaveAttribute("data-fill", "1");
    await expect(page.locator(".doctor-fly.is-visible")).toHaveCount(12);
    await expect(
      page.locator(".doctor-fly.is-visible .doctor-fly-orbit").first(),
    ).toHaveCSS("animation-play-state", "running");
    const before = (await stored(page)).content;
    await button(page).click();
    await expect(page.locator(".doctor-finding")).toHaveCount(12);
    await expect(page.locator(".doctor-summary")).toHaveText("Замечаний: 12");
    await page
      .locator(".doctor-finding")
      .filter({ hasText: "Сцена 3 · вариант A" })
      .first()
      .click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            getSelection()?.anchorNode?.parentElement?.closest("p")?.dataset
              .blockId,
        ),
      )
      .toBe("scene-3");
    expect((await stored(page)).content).toEqual(before);
    const contrasts = await page.evaluate(() => {
      const ctx = document.createElement("canvas").getContext("2d");
      const luminance = (css) => {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = css;
        ctx.fillRect(0, 0, 1, 1);
        const rgb = Array.from(ctx.getImageData(0, 0, 1, 1).data)
          .slice(0, 3)
          .map((n) => {
            const v = n / 255;
            return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
          });
        return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
      };
      const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      const sample = document.querySelector(".doctor-finding");
      const bg = luminance(getComputedStyle(sample).backgroundColor);
      const rail = luminance(
        getComputedStyle(document.querySelector(".workspace-tools"))
          .backgroundColor,
      );
      return {
        icon: ratio(
          luminance(
            getComputedStyle(document.querySelector(".script-doctor-icon"))
              .color,
          ),
          rail,
        ),
        text: ratio(
          luminance(
            getComputedStyle(
              sample.querySelector("span:not(.doctor-scene-label)"),
            ).color,
          ),
          bg,
        ),
      };
    });
    expect(contrasts.icon).toBeGreaterThan(3);
    expect(contrasts.text).toBeGreaterThan(4.5);
    await selectAppOption(
      page,
      page.getByRole("combobox", { name: "Проверка", exact: true }),
      "dialogue",
    );
    await expect(page.locator(".doctor-clear")).toHaveText(
      "В этой категории замечаний нет",
    );
    await selectAppOption(
      page,
      page.getByRole("combobox", { name: "Проверка", exact: true }),
      "all",
    );
    await page.screenshot({ path: info.outputPath(`doctor-${theme}.png`) });
    await page
      .getByRole("button", { name: "Закрыть доктора сценария" })
      .click();
    await expect(button(page)).toHaveAttribute("aria-expanded", "false");
  });
}

test("fixing errors removes flies and liquid live, and typing errors back increases them without accumulating", async ({
  page,
}) => {
  await open(page);
  await expect(icon(page)).toHaveAttribute("data-error-count", "6");
  const dirtyColor = await icon(page).evaluate(
    (node) => getComputedStyle(node).color,
  );
  await button(page).click();
  for (let i = 1; i <= 3; i++) {
    await replace(page, `scene-${i}`, `ИНТ. МЕСТО ${i} — ДЕНЬ`);
    await expect(icon(page)).toHaveAttribute(
      "data-error-count",
      String(6 - i * 2),
    );
    await expect(page.locator(".doctor-fly.is-visible")).toHaveCount(6 - i * 2);
  }
  await expect(icon(page)).toHaveAttribute("data-fill", "0");
  await expect(page.locator(".doctor-clear")).toContainText(
    "Замечаний не найдено",
  );
  await expect
    .poll(() => icon(page).evaluate((node) => getComputedStyle(node).color))
    .not.toBe(dirtyColor);
  await replace(page, "scene-1", "МЕСТО 1");
  await expect(icon(page)).toHaveAttribute("data-error-count", "2");
  await page.getByRole("button", { name: "Закрыть доктора сценария" }).click();
  await button(page).click();
  await expect(icon(page)).toHaveAttribute("data-error-count", "2");
  await page.reload();
  await expect(icon(page)).toHaveAttribute("data-error-count", "2");
});

test("a hidden F finding opens F, and switching full screenplay version resets the doctor zone", async ({
  page,
}) => {
  let doc = fixture(1);
  doc.content.content[0] = p("scene", "ИНТ. ДОМ — ДЕНЬ", "scene-1");
  doc.sceneVariants = {
    "scene-1": {
      F: [
        p("scene", "ЭКС. САД", "scene-1"),
        p("action", "Текст варианта F.", "f-action"),
      ],
    },
  };
  doc = switchScriptVersion(doc, "blue");
  doc.sceneVariants = {};
  doc = switchScriptVersion(doc, "white");
  await open(page, doc, "light", true);
  await button(page).click();
  await expect(page.locator(".doctor-finding")).toHaveCount(1);
  await expect(page.locator(".doctor-finding")).toContainText(
    "Сцена 1 · вариант F",
  );
  await page.locator(".doctor-finding").click();
  await expect(
    page.getByRole("combobox", { name: "Вариант сцены 1" }),
  ).toHaveAttribute("data-value", "F");
  await expect(page.locator('p[data-block-id="f-action"]')).toHaveText(
    "Текст варианта F.",
  );
  await selectAppOption(
    page,
    page.getByRole("combobox", { name: "Версии сценария" }),
    "blue",
  );
  await expect(page.locator(".doctor-drawer")).toHaveCount(0);
  await expect(icon(page)).toHaveAttribute("data-error-count", "0");
  await button(page).click();
  await expect(page.locator(".doctor-clear")).toContainText(
    "Замечаний не найдено",
  );
  await selectAppOption(
    page,
    page.getByRole("combobox", { name: "Версии сценария" }),
    "white",
  );
  await expect(icon(page)).toHaveAttribute("data-error-count", "1");
  await page.getByRole("button", { name: "ENG", exact: true }).click();
  await page
    .getByRole("button", { name: "Script doctor", exact: true })
    .click();
  await expect(page.locator(".doctor-finding")).toContainText(
    "Missing time of day",
  );
  await expect(page.locator(".doctor-finding")).toContainText(
    "Scene 1 · variant F",
  );
});

test("reduced motion stops particles, narrow drawer fits and full screen hides the doctor", async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await expect(
    page.locator(".doctor-fly.is-visible .doctor-fly-orbit").first(),
  ).toHaveCSS("animation-name", "none");
  await expect(page.locator(".doctor-water-surface")).toHaveCSS(
    "animation-name",
    "none",
  );
  await button(page).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".doctor-drawer")).toBeVisible();
  const box = await page.locator(".doctor-drawer").boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: info.outputPath("doctor-mobile.png") });
  await page.keyboard.press("Escape");
  await expect(page.locator(".doctor-drawer")).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Открыть во весь экран" }).click();
  await expect(button(page)).not.toBeVisible();
  await page
    .getByRole("button", { name: "Выйти из полноэкранного режима" })
    .click();
  await expect(button(page)).toBeVisible();
});

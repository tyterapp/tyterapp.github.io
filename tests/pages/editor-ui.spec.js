import { test, expect } from "@playwright/test";
import { createProject } from "../../src/data.js";
import { grantPro, storedProof } from "../helpers/pro-access.js";

const sceneText = (page) =>
  page.locator('.screenplay-editor p[data-format="scene"]').evaluate((node) => {
    const clone = node.cloneNode(true);
    clone
      .querySelectorAll(".ProseMirror-widget")
      .forEach((widget) => widget.remove());
    return clone.textContent;
  });

async function open(page, { text = "", language = "ru" } = {}) {
  await grantPro(page);
  const document = createProject("Подсказки сцен");
  document.id = "scene-ui-review";
  document.content.content = [
    {
      type: "paragraph",
      attrs: { format: "scene", blockId: "scene" },
      ...(text ? { content: [{ type: "text", text }] } : {}),
    },
  ];
  await page.addInitScript(
    ({ document, language }) => {
      localStorage.setItem("tyter.projects.v1", JSON.stringify([document]));
      localStorage.setItem("tyter.active", document.id);
      localStorage.setItem("tyter.language.v1", language);
    },
    { document, language },
  );
  await page.goto("/pro");
  await expect(page.locator(".screenplay-editor")).toBeFocused();
  await page.locator(".screenplay-editor").press("Control+End");
}

test("scene suggestions have a small aligned inset and switch language without rewriting the scene", async ({
  page,
}, info) => {
  await open(page);
  const popup = page.locator(".word-suggestions");
  await expect(popup.locator(".suggestion-label")).toHaveText([
    "ИНТ.",
    "ЭКС.",
    "ИНТ. / ЭКС.",
    "ЭКС. / ИНТ.",
  ]);
  const insets = await popup.evaluate((popup) => {
    const left = popup.getBoundingClientRect().left;
    const hint = popup.querySelector(".suggestion-hint");
    return {
      labels: [...popup.querySelectorAll(".suggestion-label")].map(
        (label) => label.getBoundingClientRect().left - left,
      ),
      hint:
        hint.getBoundingClientRect().left -
        left +
        parseFloat(getComputedStyle(hint).paddingLeft),
    };
  });
  for (const inset of insets.labels) {
    expect(inset).toBeLessThanOrEqual(10);
    expect(Math.abs(inset - insets.hint)).toBeLessThan(1);
  }
  await page.getByRole("button", { name: "ENG", exact: true }).click();
  await expect(popup.locator(".suggestion-label")).toHaveText([
    "INT.",
    "EXT.",
    "INT. / EXT.",
    "EXT. / INT.",
  ]);
  await page.screenshot({
    path: info.outputPath("english-scene-suggestions.png"),
  });
  await page.keyboard.insertText("И");
  await expect(popup.locator(".suggestion-label")).toHaveText([
    "INT.",
    "INT. / EXT.",
  ]);
  await expect.poll(() => sceneText(page)).toBe("И");
  await page.keyboard.press("Control+Enter");
  await expect.poll(() => sceneText(page)).toBe("INT. ");
});

test("English time-of-day suggestions also work in an existing Russian scene heading", async ({
  page,
}) => {
  await open(page, { text: "ИНТ. ДОМ — ", language: "en" });
  const popup = page.locator(".word-suggestions");
  await expect(popup.locator(".suggestion-label")).toHaveText([
    "DAY",
    "NIGHT",
    "EVENING",
    "MORNING",
  ]);
  await page.keyboard.insertText("Н");
  await expect(popup.locator(".suggestion-label")).toHaveText(["NIGHT"]);
  await page.keyboard.press("Control+Enter");
  await expect.poll(() => sceneText(page)).toBe("ИНТ. ДОМ — NIGHT ");
});

test("sign out stays below Help and on screen in both modes even in a short window", async ({
  page,
}, info) => {
  await open(page);
  await page.keyboard.press("Escape");
  const logout = page.getByRole("button", {
    name: "Выйти из аккаунта",
    exact: true,
  });
  const help = page.getByRole("button", { name: "Обучение", exact: true });
  for (const height of [1000, 480, 300]) {
    await page.setViewportSize({ width: 1440, height });
    for (const name of ["Сценарий", "Аутлайн"]) {
      await page.getByRole("button", { name, exact: true }).click();
      await expect(logout).toBeInViewport();
      const bounds = await logout.boundingBox();
      const helpBounds = await help.boundingBox();
      expect(bounds.y).toBeGreaterThan(helpBounds.y + helpBounds.height);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(height - 15);
      await page.locator(".workspace-tools-scroll").evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      expect((await logout.boundingBox()).y).toBe(bounds.y);
    }
  }
  await page.setViewportSize({ width: 1440, height: 700 });
  await page.getByRole("button", { name: "ENG", exact: true }).click();
  await page.screenshot({ path: info.outputPath("signout-footer.png") });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in to Pro", exact: true }),
  ).toBeVisible();
  expect(await storedProof(page)).toBeNull();
});

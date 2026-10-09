import { test, expect } from "@playwright/test";
import { createProject } from "../src/data.js";
import { libraryFromDocument } from "../src/component-library.js";
import { grantPro } from "./helpers/pro-access.js";

async function freezeTime(page) {
  await page.clock.install({ time: new Date("2026-10-09T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-09T12:00:01Z"));
}

async function open(page, theme = "light") {
  await grantPro(page);
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  const doc = createProject("Уведомления");
  await page.addInitScript(
    ({ doc, theme }) => {
      localStorage.setItem("tyter.projects.v1", JSON.stringify([doc]));
      localStorage.setItem("tyter.active", doc.id);
      localStorage.setItem("tyter.language.v1", "ru");
      localStorage.setItem("tyter.onboarding.v1", "done");
      localStorage.setItem(
        "tyter.editor-preferences.v1",
        JSON.stringify({ theme }),
      );
    },
    { doc, theme },
  );
  await page.goto("/beta");
  await expect(page.locator(".screenplay-editor")).toBeFocused();
}
async function imageWarning(page) {
  await page.evaluate(() => {
    const data = new DataTransfer();
    data.items.add(
      new File(["not an image"], "invalid.png", { type: "image/png" }),
    );
    document
      .querySelector(".screenplay-editor")
      .dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData: data,
          bubbles: true,
          cancelable: true,
        }),
      );
  });
  await expect(page.locator(".app-message")).toContainText(
    "Выберите JPG, PNG или WebP размером до 10 МБ.",
  );
  await expect(page.locator(".app-message")).not.toHaveClass(/is-closing/);
}

for (const theme of ["light", "dark"]) {
  test(`${theme}: black warnings last five seconds, repeat resets the timer and manual close fades`, async ({
    page,
  }, info) => {
    await open(page, theme);
    await freezeTime(page);
    await imageWarning(page);
    const notice = page.locator(".app-message");
    await expect(notice.locator("span")).toHaveCSS("color", "oklch(0 0 0)");
    await expect(notice).toHaveCSS("background-color", "oklch(1 0 0)");
    await expect(notice).toHaveCSS("transition-duration", "0.2s, 0.2s");
    await notice.getByRole("button", { name: "Закрыть уведомление" }).hover();
    await expect(notice.locator("button")).toHaveCSS("color", "oklch(0 0 0)");
    await page.screenshot({ path: info.outputPath("warning.png") });
    await page.clock.runFor(4999);
    await expect(notice).toBeVisible();
    await imageWarning(page);
    await page.clock.runFor(4999);
    await expect(notice).toBeVisible();
    await expect(notice).not.toHaveClass(/is-closing/);
    await page.clock.runFor(1);
    await expect(notice).toHaveClass(/is-closing/);
    await page.clock.runFor(201);
    await expect(notice).toHaveCount(0);
    await imageWarning(page);
    await notice.getByRole("button", { name: "Закрыть уведомление" }).click();
    await expect(notice).toHaveClass(/is-closing/);
    await page.clock.runFor(201);
    await expect(notice).toHaveCount(0);
  });
}

test("library import notifications translate and dismiss with reduced motion", async ({
  page,
}) => {
  await open(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const source = createProject("Библиотека для уведомлений");
  source.components = [
    { id: "anna", name: "Анна", type: "character", description: "" },
  ];
  await page.getByRole("button", { name: "Компоненты", exact: true }).click();
  await page
    .getByRole("button", { name: "Библиотеки компонентов", exact: true })
    .click();
  const modal = page.getByRole("dialog", {
    name: "Библиотеки компонентов",
    exact: true,
  });
  await modal.locator('input[type="file"]').setInputFiles({
    name: "notifications.tytl",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(libraryFromDocument(source))),
  });
  const embed = modal.getByRole("button", {
    name: "Внедрить в сценарий",
    exact: true,
  });
  await expect(embed).toBeEnabled();
  await freezeTime(page);
  await embed.click();
  const notice = page.locator(".app-message");
  await expect(notice).toContainText(
    "Компоненты: добавлено 1, обновлено 0, совпадений пропущено 0.",
  );
  await expect(notice).toHaveCSS("transition-duration", "0s");
  await page.getByRole("button", { name: "ENG", exact: true }).click();
  await expect(notice).toContainText(
    "Components: 1 added, 0 updated, 0 name conflicts skipped.",
  );
  await page.clock.runFor(5000);
  await expect(notice).toHaveClass(/is-closing/);
  await page.clock.runFor(201);
  await expect(notice).toHaveCount(0);
});

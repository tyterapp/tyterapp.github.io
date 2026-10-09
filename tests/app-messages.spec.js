import { test, expect } from "@playwright/test";
import { createProject } from "../src/data.js";
import { libraryFromDocument } from "../src/component-library.js";
import { grantPro } from "./helpers/pro-access.js";
import { selectAppOption } from "./helpers/app-select.js";

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
    document.querySelector(".screenplay-editor").dispatchEvent(
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

for (const theme of ["light", "dark"]) {
  test(`${theme}: font changes show the Courier advice and open the article without leaving the editor`, async ({
    page,
  }, info) => {
    await open(page, theme);
    await expect(page.locator(".app-message")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Настройки документа", exact: true })
      .click();
    await freezeTime(page);
    const font = page.getByRole("combobox", {
      name: /^(Шрифт в редакторе|Editor font)$/,
    });
    await selectAppOption(page, font, "georgia");
    const notice = page.locator(".app-message");
    await expect(notice).toContainText(
      "Для сценария лучше всего использовать Courier — это стандарт индустрии.",
    );
    await expect(notice.locator("span")).toHaveCSS("color", "oklch(0 0 0)");
    const link = notice.getByRole("link", { name: "Подробнее", exact: true });
    const url = "https://tyterapp.github.io/blog/standarty-v-kino";
    await expect(link).toHaveAttribute("href", url);
    await link.hover();
    await expect(link).toHaveCSS("color", "oklch(0 0 0)");
    await page.screenshot({ path: info.outputPath("font-advice.png") });
    await page.context().route(url, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<p>Стандарты в кино</p>",
      }),
    );
    const popupPromise = page.waitForEvent("popup");
    await link.click();
    const article = await popupPromise;
    await expect(article).toHaveURL(url);
    await article.close();
    await expect(page).toHaveURL(/\/beta$/);
    await expect(font).toHaveAttribute("data-value", "georgia");
    await page.getByRole("button", { name: "ENG", exact: true }).click();
    await expect(notice).toContainText(
      "Courier is recommended for screenplays — it is the industry standard.",
    );
    await expect(
      notice.getByRole("link", { name: "Learn more", exact: true }),
    ).toBeVisible();
    await page.clock.runFor(4000);
    await selectAppOption(page, font, "arial");
    await page.clock.runFor(4999);
    await expect(notice).not.toHaveClass(/is-closing/);
    await page.clock.runFor(1);
    await expect(notice).toHaveClass(/is-closing/);
    await page.clock.runFor(201);
    await expect(notice).toHaveCount(0);
    await selectAppOption(page, font, "arial");
    await expect(notice).toHaveCount(0);
  });
}

test("the font advice uses the desktop browser bridge", async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    window.supportLinks = [];
    window.tyterDesktop = {
      openSupport: (kind) => {
        window.supportLinks.push(kind);
      },
    };
  });
  await page
    .getByRole("button", { name: "Настройки документа", exact: true })
    .click();
  await selectAppOption(
    page,
    page.getByRole("combobox", { name: "Шрифт в редакторе", exact: true }),
    "consolas",
  );
  await page.getByRole("link", { name: "Подробнее", exact: true }).click();
  expect(await page.evaluate(() => window.supportLinks)).toEqual([
    "screenplay-standards",
  ]);
  await expect(page).toHaveURL(/\/beta$/);
});

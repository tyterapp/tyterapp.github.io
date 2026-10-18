import { test, expect } from "@playwright/test";
import { createProject } from "../src/data.js";
import { grantPro } from "./helpers/pro-access.js";

const fixture = () => {
  const document = createProject("Отдельные настройки компонентов");
  document.id = "component-details";
  document.components = [
    { id: "anna", name: "Анна", type: "character", color: "#8a799a" },
    { id: "nora", name: "Нора", type: "character", color: "#8a799a" },
  ];
  document.props = [
    { id: "lamp", name: "Лампа", quantity: 2, category: "Objects" },
    { id: "chair", name: "Стул", quantity: 1, category: "Objects" },
  ];
  return document;
};

async function open(page, language, document = fixture()) {
  await grantPro(page);
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  await page.addInitScript(
    ({ document, language }) => {
      localStorage.setItem("tyter.projects.v1", JSON.stringify([document]));
      localStorage.setItem("tyter.active", document.id);
      localStorage.setItem("tyter.onboarding.v1", "done");
      localStorage.setItem("tyter.language.v1", language);
      localStorage.setItem(
        "tyter.editor-preferences.v1",
        JSON.stringify({ theme: "dark" }),
      );
    },
    { document, language },
  );
  await page.goto("/pro");
  await expect(page.locator(".screenplay-editor")).toBeVisible();
}

for (const language of ["ru", "en"])
  test(`${language}: component and prop rows open separate details and Back restores the filtered list and focus`, async ({
    page,
  }) => {
    await open(page, language);
    const rail = page.getByRole("navigation", {
      name: language === "en" ? "Editor tools" : "Инструменты редактора",
    });
    for (const item of [
      {
        tool: language === "en" ? "Components" : "Компоненты",
        search: language === "en" ? "Search components" : "Поиск компонентов",
        selector: '[data-component-id="anna"]',
        name: "Анна",
        query: "Ан",
      },
      {
        tool: language === "en" ? "Props" : "Реквизит",
        search: language === "en" ? "Search props" : "Поиск реквизита",
        selector: '[data-prop-id="lamp"]',
        name: "Лампа",
        query: "Лам",
      },
    ]) {
      await rail.getByRole("button", { name: item.tool, exact: true }).click();
      const drawer = page.locator("aside.components-drawer");
      await drawer.getByLabel(item.search, { exact: true }).fill(item.query);
      const row = drawer.locator(`${item.selector} .component-item`);
      await expect(row.locator("svg.lucide-chevron-right")).toHaveCount(1);
      await row.click();
      await expect(drawer).toHaveClass(/component-detail-drawer/);
      await expect(
        drawer.getByRole("heading", { name: item.name, exact: true }),
      ).toBeVisible();
      await expect(drawer.locator(".sidebar-search")).toHaveCount(0);
      await expect(drawer.locator(".component-folders")).toHaveCount(0);
      await expect(drawer.locator(".component-editor")).toHaveCount(1);
      const back = drawer.getByRole("button", {
        name: language === "en" ? "Back" : "Назад",
        exact: true,
      });
      await expect(back.locator("svg.lucide-arrow-left")).toHaveCount(1);
      const bounds = await back.boundingBox();
      expect(bounds.width).toBeGreaterThanOrEqual(40);
      expect(bounds.height).toBeGreaterThanOrEqual(40);
      await back.click();
      await expect(drawer).not.toHaveClass(/component-detail-drawer/);
      await expect(drawer.getByLabel(item.search, { exact: true })).toHaveValue(
        item.query,
      );
      await expect(row).toBeFocused();
      await row.click();
      await drawer
        .getByRole("button", {
          name:
            language === "en"
              ? item.tool === "Components"
                ? "Close components"
                : "Close props"
              : item.tool === "Компоненты"
                ? "Закрыть компоненты"
                : "Закрыть реквизит",
          exact: true,
        })
        .click();
      await expect(drawer).toHaveCount(0);
    }
  });

test("Back restores the exact component and prop list scroll position", async ({
  page,
}) => {
  const document = fixture();
  document.components.push(
    ...Array.from({ length: 80 }, (_, index) => ({
      id: `extra-character-${index}`,
      name: `Персонаж ${index + 1}`,
      type: "character",
      color: "#8a799a",
    })),
  );
  document.props.push(
    ...Array.from({ length: 80 }, (_, index) => ({
      id: `extra-prop-${index}`,
      name: `Предмет ${index + 1}`,
      quantity: 1,
      category: "Objects",
    })),
  );
  await open(page, "ru", document);
  const rail = page.getByRole("navigation", { name: "Инструменты редактора" });
  for (const [tool, selector] of [
    ["Компоненты", '[data-component-id="extra-character-70"]'],
    ["Реквизит", '[data-prop-id="extra-prop-70"]'],
  ]) {
    await rail.getByRole("button", { name: tool, exact: true }).click();
    const drawer = page.locator("aside.components-drawer");
    const row = drawer.locator(`${selector} .component-item`);
    await row.scrollIntoViewIfNeeded();
    const before = await drawer
      .locator(".component-folders")
      .evaluate((element) => element.scrollTop);
    expect(before).toBeGreaterThan(0);
    await row.click();
    await drawer.getByRole("button", { name: "Назад", exact: true }).click();
    await expect
      .poll(() =>
        drawer
          .locator(".component-folders")
          .evaluate((element) => element.scrollTop),
      )
      .toBeCloseTo(before, 0);
    await expect(row).toBeFocused();
  }
});

const savedComponent = (page, componentId) =>
  page.evaluate(
    (componentId) =>
      new Promise((resolve) => {
        const request = indexedDB.open("tyter.local-files.v1", 1);
        request.onerror = () => resolve(null);
        request.onsuccess = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains("files")) {
            database.close();
            resolve(null);
            return;
          }
          const read = database
            .transaction("files")
            .objectStore("files")
            .get("documents");
          read.onerror = () => {
            database.close();
            resolve(null);
          };
          read.onsuccess = () => {
            const component = read.result
              ?.find((document) => document.id === "component-details")
              ?.components.find((item) => item.id === componentId);
            database.close();
            resolve(component || null);
          };
        };
      }),
    componentId,
  );

for (const language of ["ru", "en"])
  test(`${language}: alias conflict links preserve the invalid draft through another component and Back without saving; Cancel discards and Save commits it`, async ({
    page,
  }) => {
    const document = fixture();
    document.components[0].aliases = ["Аня"];
    document.components[0].description = "Сохранённое описание";
    document.components[1].aliases = ["Jeff"];
    document.components.push({
      id: "lev",
      name: "Лев",
      type: "character",
      aliases: ["Captain"],
      color: "#8a799a",
    });
    await open(page, language, document);
    const english = language === "en";
    await expect
      .poll(async () => (await savedComponent(page, "anna"))?.aliases)
      .toEqual(["Аня"]);
    const original = await savedComponent(page, "anna");
    await page
      .getByRole("navigation", {
        name: english ? "Editor tools" : "Инструменты редактора",
      })
      .getByRole("button", {
        name: english ? "Components" : "Компоненты",
        exact: true,
      })
      .click();
    const drawer = page.locator("aside.components-drawer");
    const profile = drawer.locator(".component-editor form");
    const aliases = profile.getByLabel(english ? "Aliases" : "Алиасы", {
      exact: true,
    });
    const description = profile.getByLabel(
      english ? /Description/ : /Описание/,
    );
    const save = profile.getByRole("button", {
      name: english ? "Save" : "Сохранить",
      exact: true,
    });
    const back = drawer.getByRole("button", {
      name: english ? "Back" : "Назад",
      exact: true,
    });
    const invalidAliases = "Jeff\nCaptain\nАвторский алиас";
    await drawer.locator('[data-component-id="anna"] .component-item').click();
    await aliases.fill(invalidAliases);
    await description.fill("Несохранённое описание");
    await expect(aliases).toHaveAttribute("aria-invalid", "true");
    await expect(save).toBeDisabled();
    const conflicts = profile.locator(".component-alias-conflicts");
    await expect(conflicts).toHaveAttribute("role", "alert");
    await expect(conflicts.locator("li")).toHaveCount(2);
    await expect(conflicts).toContainText("Jeff → Нора");
    await expect(conflicts).toContainText("Captain → Лев");
    for (const name of ["Нора", "Лев"]) {
      await profile
        .getByRole("button", {
          name: english
            ? `Open component “${name}”`
            : `Открыть компонент «${name}»`,
          exact: true,
        })
        .click();
      await expect(drawer.locator(".component-detail-heading h2")).toHaveText(
        name,
      );
      await expect(aliases).toHaveValue(name === "Нора" ? "Jeff" : "Captain");
      expect(await savedComponent(page, "anna")).toEqual(original);
      await back.click();
      await drawer
        .locator('[data-component-id="anna"] .component-item')
        .click();
      await expect(aliases).toHaveValue(invalidAliases);
      await expect(description).toHaveValue("Несохранённое описание");
      await expect(save).toBeDisabled();
      await expect(conflicts.locator("li")).toHaveCount(2);
      expect(await savedComponent(page, "anna")).toEqual(original);
    }
    await profile
      .getByRole("button", { name: english ? "Cancel" : "Отмена", exact: true })
      .click();
    await drawer.locator('[data-component-id="anna"] .component-item').click();
    await expect(aliases).toHaveValue("Аня");
    await expect(description).toHaveValue("Сохранённое описание");
    await expect(conflicts).toHaveCount(0);
    expect(await savedComponent(page, "anna")).toEqual(original);
    await aliases.fill("Анютка");
    await description.fill("Новое сохранённое описание");
    await expect(save).toBeEnabled();
    await save.click();
    await expect
      .poll(async () => (await savedComponent(page, "anna"))?.aliases)
      .toEqual(["Анютка"]);
    await drawer.locator('[data-component-id="anna"] .component-item').click();
    await expect(aliases).toHaveValue("Анютка");
    await expect(description).toHaveValue("Новое сохранённое описание");
    await expect(conflicts).toHaveCount(0);
  });

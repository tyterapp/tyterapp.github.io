import { test, expect } from "@playwright/test";
import { createProject } from "../src/data.js";
import { grantPro } from "./helpers/pro-access.js";

async function open(page, theme = "light") {
  await grantPro(page);
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  await page.addInitScript(
    ({ doc, theme }) => {
      const date = new Date(),
        now = date.getTime();
      const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
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
          coins: 10,
          session: null,
          streak: { day, count: 1, best: 1 },
          purchases: { "oiia-house": { cost: 100, purchasedAt: now } },
        }),
      );
    },
    { doc: createProject("Панели по содержимому"), theme },
  );
  await page.goto("/beta");
  await expect(page.locator(".screenplay-editor")).toBeVisible();
}

const shop = (page) => page.locator("#writing-shop");
const openShop = (page) =>
  page.getByRole("button", { name: "Открыть магазин", exact: true });
const closeShop = (page) =>
  shop(page).getByRole("button", { name: "Закрыть магазин", exact: true });
const overflow = (page) =>
  shop(page)
    .locator(".writing-popover-scroll")
    .evaluate((el) => el.scrollHeight - el.clientHeight);

for (const theme of ["light", "dark"]) {
  test(`${theme}: pointer clicks have no focus rings, while desktop Tab and keyboard popover navigation keep rings`, async ({
    page,
  }) => {
    await open(page, theme);
    await openShop(page).click();
    await expect(closeShop(page)).toBeFocused();
    await expect(closeShop(page)).toHaveCSS("outline-style", "none");
    await shop(page)
      .getByRole("button", { name: "Локации", exact: true })
      .click();
    const back = shop(page).getByRole("button", {
      name: "Назад к категориям",
      exact: true,
    });
    await expect(back).toBeFocused();
    await expect(back).toHaveCSS("outline-style", "none");
    await back.click();
    await expect(
      shop(page).getByRole("button", { name: "Локации", exact: true }),
    ).toHaveCSS("outline-style", "none");
    await closeShop(page).click();
    await expect(shop(page)).toHaveCount(0);
    await expect(openShop(page)).toHaveCSS("outline-style", "none");

    // Place focus before the opener, then use actual Tab navigation.
    await page
      .getByRole("button", { name: "Открыть oiia домик", exact: true })
      .focus();
    await page.keyboard.press("Tab");
    await expect(openShop(page)).toBeFocused();
    await expect(openShop(page)).toHaveCSS("outline-style", "solid");
    await page.keyboard.press("Enter");
    await expect(closeShop(page)).toBeFocused();
    await expect(closeShop(page)).toHaveCSS("outline-width", "2px");
    await page.keyboard.press("Tab");
    const skins = shop(page).getByRole("button", {
      name: "Скины",
      exact: true,
    });
    await expect(skins).toBeFocused();
    await expect(skins).toHaveCSS("outline-style", "solid");
    await page.keyboard.press("Enter");
    await expect(back).toBeFocused();
    await expect(back).toHaveCSS("outline-style", "solid");
    await page.keyboard.press("Escape");
    await expect(shop(page)).toHaveCount(0);
    await expect(openShop(page)).toBeFocused();
    await expect(openShop(page)).toHaveCSS("outline-style", "solid");
    await openShop(page).click();
    await expect(closeShop(page)).toHaveCSS("outline-style", "none");
    await closeShop(page).click();

    for (const [opener, id, closer] of [
      ["Открыть oiia домик", "writing-house", "Закрыть домик"],
      ["Монеты: 10", "writing-coins", "Закрыть монеты"],
    ]) {
      await page.getByRole("button", { name: opener, exact: true }).click();
      const close = page
        .locator(`#${id}`)
        .getByRole("button", { name: closer, exact: true });
      await expect(close).toBeFocused();
      await expect(close).toHaveCSS("outline-style", "none");
      await close.click();
    }
  });

  test(`${theme}: popovers fit their content in a tall window and scroll only when available space runs out`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await open(page, theme);
    await openShop(page).click();
    await expect.poll(() => overflow(page)).toBeLessThanOrEqual(1);
    expect((await shop(page).boundingBox()).height).toBeGreaterThan(360);
    await page.screenshot({ path: info.outputPath("full-shop-desktop.png") });
    await page.setViewportSize({ width: 390, height: 850 });
    await expect(page.locator(".minimal-app")).toHaveAttribute(
      "data-mobile",
      "true",
    );
    await expect.poll(() => overflow(page)).toBeLessThanOrEqual(1);
    await expect(closeShop(page)).toHaveCSS("outline-style", "none");
    await expect(
      shop(page).getByRole("button", {
        name: "Сбросить прогресс 200",
        exact: true,
      }),
    ).toBeInViewport();
    await page.screenshot({ path: info.outputPath("full-shop-mobile.png") });

    await page.setViewportSize({ width: 390, height: 460 });
    await expect.poll(() => overflow(page)).toBeGreaterThan(1);
    await expect(closeShop(page)).toBeInViewport();
    const outer = await shop(page).boundingBox(),
      column = await page.locator(".editor-column").boundingBox();
    expect(outer.y).toBeGreaterThanOrEqual(column.y + 10);
    await shop(page).locator(".writing-popover-scroll").hover();
    await page.mouse.wheel(0, 500);
    await expect(
      shop(page).getByRole("button", {
        name: "Сбросить прогресс 200",
        exact: true,
      }),
    ).toBeInViewport();
    await expect(closeShop(page)).toBeInViewport();
    await page.screenshot({
      path: info.outputPath("scrolling-shop-mobile.png"),
    });

    await page.setViewportSize({ width: 390, height: 850 });
    await expect.poll(() => overflow(page)).toBeLessThanOrEqual(1);
    await closeShop(page).click();
    await page
      .getByRole("button", { name: "Открыть oiia домик", exact: true })
      .click();
    const house = page.locator("#writing-house");
    await expect
      .poll(() =>
        house
          .locator("img")
          .evaluate((img) => img.complete && img.naturalWidth),
      )
      .toBe(734);
    expect(
      await house
        .locator(".writing-popover-scroll")
        .evaluate((el) => el.scrollHeight - el.clientHeight),
    ).toBeLessThanOrEqual(1);
    await house
      .getByRole("button", { name: "Закрыть домик", exact: true })
      .click();
    await page.locator(".writing-timer-balance").click();
    const coins = page.locator("#writing-coins");
    expect(
      await coins
        .locator(".writing-popover-scroll")
        .evaluate((el) => el.scrollHeight - el.clientHeight),
    ).toBeLessThanOrEqual(1);
    await coins
      .getByRole("button", { name: "Стрики за день", exact: true })
      .click();
    expect((await coins.boundingBox()).height).toBeLessThan(360);
    await coins
      .getByRole("button", { name: "Закрыть монеты", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Открыть инструменты", exact: true })
      .click();
    const sheet = page.getByRole("dialog", {
      name: "Инструменты редактора",
      exact: true,
    });
    const handle = sheet.getByRole("button", {
      name: "Закрыть шторку",
      exact: true,
    });
    await expect(handle).toBeFocused();
    await expect(handle).toHaveCSS("outline-style", "none");
    await page.keyboard.press("Tab");
    await expect(sheet.locator("button:focus")).toHaveCSS(
      "outline-style",
      "none",
    );
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
  });
}

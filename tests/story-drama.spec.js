import { test, expect } from "@playwright/test";
import { createProject } from "../src/data.js";
import { SCRIPT_VERSIONS } from "../src/script-version-colors.js";
import { grantPro } from "./helpers/pro-access.js";

test.setTimeout(60000);
async function open(page, { theme = "dark", width = 1600, count = 3 } = {}) {
  await grantPro(page);
  await page.setViewportSize({ width, height: 1000 });
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  const doc = createProject("График истории");
  doc.id = "drama-story";
  doc.content.content = Array.from({ length: count }, (_, index) => [
    {
      type: "paragraph",
      attrs: { format: "scene", blockId: `scene-${index}` },
      content: [{ type: "text", text: `INT. ROOM ${index + 1} — DAY` }],
    },
    {
      type: "paragraph",
      attrs: { format: "action", blockId: `text-${index}` },
      content: [{ type: "text", text: `The story continues ${index + 1}.` }],
    },
  ]).flat();
  doc.sceneShots = Object.fromEntries(
    Array.from({ length: count }, (_, index) => [
      `scene-${index}`,
      {
        A: {
          drama: index === 0 ? 4 : index === 1 ? 8 : 1,
          act: index < 2 ? 1 : 2,
        },
        B: { drama: 9 },
      },
    ]),
  );
  await page.addInitScript(
    ({ doc, theme }) => {
      if (sessionStorage.getItem("drama-seeded")) return;
      sessionStorage.setItem("drama-seeded", "1");
      localStorage.setItem("tyter.projects.v1", JSON.stringify([doc]));
      localStorage.setItem("tyter.active", doc.id);
      localStorage.setItem("tyter.editor-intro.v1", "seen");
      localStorage.setItem("tyter.language.v1", "ru");
      localStorage.setItem(
        "tyter.editor-preferences.v1",
        JSON.stringify({ theme }),
      );
    },
    { doc, theme },
  );
  await page.goto("/pro");
  await expect(page.locator(".screenplay-editor")).toBeVisible();
}
const chart = (page) => page.locator(".story-drama-panel");
const point = (page, id = "scene-0") =>
  chart(page).locator(`.story-drama-point[data-scene="${id}"]`);
const board = async (page) => {
  const mobile = await page.locator(".mobile-mode-tabs").isVisible();
  await page
    .locator(mobile ? ".mobile-mode-tabs" : ".document-view-toggle")
    .getByRole("button", { name: "Раскадровка", exact: true })
    .click();
};
const details = async (page) => {
  const panel = page.locator(".story-inspector");
  await panel.getByRole("tab", { name: "Инфо", exact: true }).click();
  await panel.getByRole("tab", { name: "DETAILS", exact: true }).click();
  return panel.getByLabel("Драматичность", { exact: true });
};
const saved = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const opening = indexedDB.open("tyter.local-files.v1", 1);
        opening.onsuccess = () => {
          const database = opening.result;
          const read = database
            .transaction("files")
            .objectStore("files")
            .get("documents");
          read.onsuccess = () => {
            resolve(read.result?.find((doc) => doc.id === "drama-story"));
            database.close();
          };
        };
      }),
  );
async function dragPoint(page, delta, cancel = false) {
  const box = await point(page).locator(".story-drama-hit").boundingBox();
  await page.mouse.move(box.x + 22, box.y + 22);
  await page.mouse.down();
  await page.mouse.move(box.x + 22, box.y + 22 + delta, { steps: 12 });
  if (cancel) await page.keyboard.press("Escape");
  await page.mouse.up();
}

for (const theme of ["light", "dark"])
  test(`${theme}: separate drama panel drags scene values, synchronizes settings, supports keyboard, cancel and undo, and persists active variants`, async ({
    page,
  }, info) => {
    await open(page, { theme });
    await expect(page.locator(".story-drama-launch")).toHaveCount(0);
    await board(page);
    const launch = page.locator(".story-drama-launch");
    await expect(launch).toBeVisible();
    await launch.click();
    await expect(chart(page)).toBeVisible();
    await expect(chart(page).getByRole("slider")).toHaveCount(3);
    await expect(launch.locator(".story-drama-icon")).toHaveCSS(
      "mask-image",
      /line-segments\.svg/,
    );
    await expect(point(page)).toHaveAttribute("aria-valuenow", "4");
    await dragPoint(page, -52);
    await expect(point(page)).toHaveAttribute("aria-valuenow", "7");
    const rating = await details(page);
    await expect(rating).toHaveValue("7");
    await point(page).focus();
    await page.keyboard.press("Control+z");
    await expect(point(page)).toHaveAttribute("aria-valuenow", "4");
    await page.keyboard.press("Control+Shift+z");
    await expect(point(page)).toHaveAttribute("aria-valuenow", "7");
    await rating.fill("2");
    await expect(point(page)).toHaveAttribute("aria-valuenow", "2");
    await point(page).focus();
    await page.keyboard.press("ArrowUp");
    await expect(rating).toHaveValue("3");
    await page.keyboard.press("Home");
    await expect(rating).toHaveValue("1");
    await page.keyboard.press("End");
    await expect(rating).toHaveValue("10");
    await dragPoint(page, 52, true);
    await expect(point(page)).toHaveAttribute("aria-valuenow", "10");
    await chart(page)
      .getByLabel("Драматичность выбранной сцены", { exact: true })
      .fill("6");
    await expect(rating).toHaveValue("6");
    await expect
      .poll(async () => (await saved(page))?.sceneShots["scene-0"])
      .toMatchObject({ A: { drama: 6 }, B: { drama: 9 } });
    await page.screenshot({
      path: info.outputPath(`drama-panel-${theme}.png`),
    });
    await chart(page)
      .getByRole("button", { name: "Закрыть график", exact: true })
      .click();
    await expect(chart(page)).toHaveCount(0);
    await expect(launch).toBeFocused();
    await page
      .locator(".story-inspector")
      .getByRole("button", { name: "График драматичности", exact: true })
      .click();
    await expect(chart(page)).toBeVisible();
    await page
      .locator(".document-view-toggle")
      .getByRole("button", { name: "Сценарий", exact: true })
      .click();
    await expect(page.locator(".story-drama-launch")).toHaveCount(0);
    await expect(chart(page)).toBeVisible();
    const bandColors = await chart(page)
      .locator('.story-drama-act-band[data-alternate="true"]')
      .evaluate((element) => {
        const style = getComputedStyle(element);
        const probe = document.createElement("span");
        probe.style.color = style.getPropertyValue("--ui-soft").trim();
        document.body.append(probe);
        const theme = getComputedStyle(probe).color;
        probe.remove();
        return { fill: style.fill, theme };
      });
    expect(bandColors.fill).toBe(bandColors.theme);
    await page.keyboard.press("Escape");
    await page.reload();
    await board(page);
    await page.locator(".story-drama-launch").click();
    await expect(point(page)).toHaveAttribute("aria-valuenow", "6");
  });

test("all nine page colors use their own geometric graph keys and update after a page color changes", async ({
  page,
}) => {
  await open(page);
  for (const version of SCRIPT_VERSIONS) {
    await page
      .getByRole("combobox", { name: "Цвет страницы 1", exact: true })
      .hover();
    await page
      .getByRole("option", { name: version.label, exact: true })
      .click();
    await board(page);
    if (!(await chart(page).isVisible()))
      await page.locator(".story-drama-launch").click();
    await expect(point(page).locator(".script-version-icon")).toHaveAttribute(
      "data-version-shape",
      version.id,
    );
    await page
      .locator(".document-view-toggle")
      .getByRole("button", { name: "Сценарий", exact: true })
      .click();
  }
});

test("above 1920px storyboard cards double at the same zoom and stay centered on resize and with an inspector", async ({
  page,
}, info) => {
  await open(page, { width: 1920 });
  await board(page);
  const image = page.locator(".story-card .story-image").first();
  const width = await image.evaluate(
    (node) => node.getBoundingClientRect().width,
  );
  expect(width).toBeCloseTo(180, 0);
  await page.setViewportSize({ width: 1921, height: 1080 });
  await expect
    .poll(() => image.evaluate((node) => node.getBoundingClientRect().width))
    .toBeCloseTo(width * 2, 0);
  await page.setViewportSize({ width: 2560, height: 1440 });
  const group = await page.locator(".story-page-group").first().boundingBox(),
    viewport = await page.locator(".story-board-scroll").boundingBox();
  expect(
    Math.abs(group.x + group.width / 2 - viewport.x - viewport.width / 2),
  ).toBeLessThan(12);
  await page.locator(".story-card-select").first().click();
  await expect(image).toHaveCSS("width", "360px");
  await page.screenshot({ path: info.outputPath("storyboard-2560.png") });
  await page.setViewportSize({ width: 1800, height: 1000 });
  await expect
    .poll(() => image.evaluate((node) => node.getBoundingClientRect().width))
    .toBeCloseTo(width, 0);
});

test("mobile graph supports real touch dragging and horizontally exposes every scene", async ({
  page,
  context,
}, info) => {
  await open(page, { width: 390, count: 12 });
  await board(page);
  await page.locator(".story-drama-launch").click();
  await expect(chart(page).getByRole("slider")).toHaveCount(12);
  expect(
    await chart(page)
      .locator(".story-drama-plot")
      .evaluate((node) => node.scrollWidth > node.clientWidth),
  ).toBe(true);
  const box = await point(page).locator(".story-drama-hit").boundingBox();
  const cdp = await context.newCDPSession(page);
  const touch = (type, y) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints:
        type === "touchEnd"
          ? []
          : [{ id: 1, x: box.x + 22, y, radiusX: 2, radiusY: 2, force: 1 }],
    });
  await touch("touchStart", box.y + 22);
  await touch("touchMove", box.y + 22 - 52);
  await expect(point(page)).toHaveAttribute("aria-valuenow", "7");
  await touch("touchEnd");
  await expect
    .poll(async () => (await saved(page))?.sceneShots["scene-0"].A.drama)
    .toBe(7);
  await expect(page.locator(".story-inspector")).toHaveCount(0);
  await point(page).locator(".story-drama-hit").click();
  await expect(await details(page)).toHaveValue("7");
  await page
    .locator(".story-inspector")
    .getByRole("button", { name: "График драматичности", exact: true })
    .click();
  await expect(page.locator(".story-inspector")).toHaveCount(0);
  await expect(chart(page)).toBeVisible();
  await page
    .locator(".mobile-mode-tabs")
    .getByRole("button", { name: "Сценарий", exact: true })
    .click();
  await expect(page.locator(".story-drama-launch")).toHaveCount(0);
  await dragPoint(page, -52);
  await expect(point(page)).toHaveAttribute("aria-valuenow", "10");
  await expect(page.locator(".story-inspector")).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("drama-mobile.png") });
});

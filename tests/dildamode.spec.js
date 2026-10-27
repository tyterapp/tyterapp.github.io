import { test, expect } from "@playwright/test";
import { createProject } from "../src/data.js";
import { openWritingShop } from "./helpers/writing-shop.js";

test.use({ serviceWorkers: "block" });
const wallet = "tyter.dildamode.writing-timer.v1";
async function open(page, balance = 200) {
  await page.route("**/__tyter_local/**", (r) => r.fulfill({ status: 404 }));
  const doc = createProject("Frozen screenplay");
  doc.content.content = Array.from({ length: 45 }, (_, i) => ({
    type: "paragraph",
    attrs: { format: i === 0 ? "scene" : "action", blockId: `dm-${i}` },
    content: [
      {
        type: "text",
        text:
          i === 0
            ? "INT. STUDIO — DAY"
            : `Line ${i}. The screenplay stays intact after every shot.`,
      },
    ],
  }));
  await page.addInitScript(
    ({ doc, balance, wallet }) => {
      if (sessionStorage.getItem("dm-test-seeded")) return;
      sessionStorage.setItem("dm-test-seeded", "yes");
      const now = new Date();
      const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      for (const prefix of ["tyter.", "tyter.dildamode."]) {
        localStorage.setItem(`${prefix}language.v1`, "ru");
        localStorage.setItem(
          `${prefix}editor-preferences.v1`,
          JSON.stringify({ theme: "light" }),
        );
        localStorage.setItem(`${prefix}projects.v1`, JSON.stringify([doc]));
        localStorage.setItem(`${prefix}active`, doc.id);
      }
      localStorage.setItem(
        wallet,
        JSON.stringify({
          coins: balance,
          session: null,
          streak: { day, count: 1, best: 1 },
        }),
      );
      localStorage.setItem(
        "tyter.writing-timer.v1",
        JSON.stringify({
          coins: 333,
          session: null,
          streak: { day, count: 1, best: 1 },
        }),
      );
    },
    { doc, balance, wallet },
  );
  await page.goto("/dildamode/");
  await expect(page.locator(".screenplay-editor")).toBeVisible();
  return doc;
}
async function shop(page) {
  await openWritingShop(page);
  await page.getByRole("button", { name: "Разное", exact: true }).click();
}
async function enter(page) {
  await shop(page);
  await page
    .getByRole("button", {
      name: "Купить Dilda Mode за 100 монет",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Открыть Dilda Mode", exact: true })
    .click();
  await expect(page.locator(".dm-game")).toBeVisible();
}
test("isolated shop requires 100 coins and the normal editor has no Dilda Mode", async ({
  page,
}) => {
  await open(page, 99);
  await shop(page);
  await expect(
    page.getByRole("button", {
      name: "Купить Dilda Mode за 100 монет",
      exact: true,
    }),
  ).toBeDisabled();
  await expect
    .poll(() =>
      page
        .locator('[data-product="dildamode"] img')
        .evaluate((el) => el.naturalWidth),
    )
    .toBeGreaterThan(0);
  await page.goto("/free");
  await expect(page.locator(".screenplay-editor")).toBeVisible();
  await shop(page);
  await expect(page.locator('[data-product="dildamode"]')).toHaveCount(0);
});
test("one purchase, real 3D, both projectiles, sound and paper hits preserve screenplay and main wallet", async ({
  page,
}, info) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page);
  const before = await page
    .locator(".screenplay-editor")
    .evaluate((el) => el.editor.getJSON());
  const mainBefore = await page.evaluate(() => ({
    docs: localStorage.getItem("tyter.projects.v1"),
    wallet: localStorage.getItem("tyter.writing-timer.v1"),
  }));
  await enter(page);
  await expect
    .poll(() =>
      page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)).coins,
        wallet,
      ),
    )
    .toBe(100);
  await expect(page.locator(".dm-model")).toHaveAttribute(
    "data-renderer",
    "webgl",
  );
  await page.screenshot({ path: info.outputPath("voxel-model.png") });
  await expect(page.locator(".dm-game .dm-hit-count")).toHaveText("0");
  const paper = page.locator(".dm-paper");
  await paper.click({ position: { x: 250, y: 260 } });
  await expect(page.locator(".dm-hit-count")).toHaveText("1");
  await expect(page.locator(".dm-impact")).toHaveCount(1);
  await expect
    .poll(() => page.locator(".dm-shot-audio").evaluate((el) => el.currentTime))
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "Помидор", exact: true }).click();
  await paper.click({ position: { x: 350, y: 370 } });
  await expect(page.locator(".dm-hit-count")).toHaveText("2");
  await expect(page.locator(".dm-splat")).toHaveCount(1);
  await page.screenshot({ path: info.outputPath("tomato-hit.png") });
  const splat = await page.locator(".dm-splat").boundingBox();
  await page.locator(".dm-scene").evaluate((el) => {
    el.scrollTop += 180;
  });
  await expect
    .poll(async () =>
      Math.round((await page.locator(".dm-splat").boundingBox()).y),
    )
    .toBe(Math.round(splat.y - 180));
  await page
    .getByRole("button", { name: "Закрыть Dilda Mode", exact: true })
    .click();
  await expect(page.locator(".dm-game")).toHaveCount(0);
  expect(
    await page
      .locator(".screenplay-editor")
      .evaluate((el) => el.editor.getJSON()),
  ).toEqual(before);
  expect(
    await page.evaluate(() => ({
      docs: localStorage.getItem("tyter.projects.v1"),
      wallet: localStorage.getItem("tyter.writing-timer.v1"),
    })),
  ).toEqual(mainBefore);
  await page.reload();
  await expect(page.locator(".screenplay-editor")).toBeVisible();
  await shop(page);
  await expect(
    page.getByRole("button", { name: "Открыть Dilda Mode", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Открыть Dilda Mode", exact: true })
    .click();
  await expect(page.locator(".dm-hit-count")).toHaveText("0");
  await page.keyboard.press("Escape");
  await expect(page.locator(".dm-game")).toHaveCount(0);
  await expect(page.locator(".screenplay-editor")).toBeFocused();
  expect(errors).toEqual([]);
});
test("outside-paper shots miss, and all runtime assets remain in the frozen route", async ({
  page,
}) => {
  const external = [];
  page.on("request", (req) => {
    const url = new URL(req.url());
    if (
      ["script", "stylesheet", "image", "font", "media"].includes(
        req.resourceType(),
      ) &&
      !url.pathname.startsWith("/dildamode/")
    )
      external.push(url.pathname);
  });
  await open(page);
  await enter(page);
  await page.locator(".dm-scene").click({ position: { x: 4, y: 250 } });
  await expect(page.locator(".dm-hit-count")).toHaveText("0");
  await expect
    .poll(() => page.locator(".dm-shot-audio").evaluate((el) => el.currentTime))
    .toBeGreaterThan(0);
  await page.keyboard.press("Escape");
  expect(external).toEqual([]);
});

test("many hits keep counting while limiting visual effects", async ({
  page,
}) => {
  await open(page);
  await enter(page);
  await page.locator(".dm-paper").evaluate((el) => {
    const r = el.getBoundingClientRect();
    for (let i = 0; i < 305; i++)
      el.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          button: 0,
          clientX: r.left + 200,
          clientY: r.top + 200,
        }),
      );
  });
  await expect(page.locator(".dm-hit-count")).toHaveText("305");
  await expect(page.locator(".dm-impact")).toHaveCount(300);
  await page.keyboard.press("Escape");
  await expect(page.locator(".dm-game")).toHaveCount(0);
});

test("gameplay blocks background editor undo and redo shortcuts", async ({
  page,
}) => {
  await open(page);
  const editor = page.locator(".screenplay-editor");
  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" Added text before playing.");
  const before = await editor.evaluate((el) => el.editor.getJSON());
  await enter(page);
  await page.keyboard.press("Control+z");
  expect(await editor.evaluate((el) => el.editor.getJSON())).toEqual(before);
  await page.keyboard.press("Control+y");
  expect(await editor.evaluate((el) => el.editor.getJSON())).toEqual(before);
  await page.keyboard.press("Escape");
  expect(await editor.evaluate((el) => el.editor.getJSON())).toEqual(before);
});

test("gameplay blocks editor settings shortcuts", async ({ page }) => {
  await open(page);
  const before = await page.evaluate(() =>
    localStorage.getItem("tyter.dildamode.editor-preferences.v1"),
  );
  await enter(page);
  await page.keyboard.press("Control+Alt+e");
  expect(
    await page.evaluate(() =>
      localStorage.getItem("tyter.dildamode.editor-preferences.v1"),
    ),
  ).toBe(before);
  await page.keyboard.press("Escape");
});

test("small-screen and unavailable WebGL retain playable fallback and exit", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return type === "webgl" ? null : original.call(this, type, ...args);
    };
  });
  await open(page);
  await enter(page);
  await expect(page.locator(".dm-model")).toHaveAttribute(
    "data-renderer",
    "fallback",
  );
  await expect(page.locator(".dm-fallback img")).toBeVisible();
  await page.getByRole("button", { name: "Помидор", exact: true }).click();
  await page.locator(".dm-paper").click({ position: { x: 150, y: 200 } });
  await expect(page.locator(".dm-hit-count")).toHaveText("1");
  await page.screenshot({ path: info.outputPath("small-screen.png") });
  await page
    .getByRole("button", { name: "Закрыть Dilda Mode", exact: true })
    .click();
  await expect(page.locator(".dm-game")).toHaveCount(0);
});

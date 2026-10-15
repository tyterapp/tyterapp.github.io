import { test, expect } from "@playwright/test";
import { createProject } from "../../src/data.js";
import { grantPro } from "../helpers/pro-access.js";

test("the supplied TikiTok video loops offline and cached byte ranges remain correct", async ({
  page,
  context,
}) => {
  await grantPro(page);
  await page.addInitScript((doc) => {
    if (sessionStorage.getItem("tikitok-offline-seeded")) return;
    sessionStorage.setItem("tikitok-offline-seeded", "1");
    localStorage.setItem("tyter.projects.v1", JSON.stringify([doc]));
    localStorage.setItem("tyter.active", doc.id);
    localStorage.setItem("tyter.language.v1", "ru");
    localStorage.setItem(
      "tyter.writing-timer.v1",
      JSON.stringify({
        coins: 0,
        session: null,
        purchases: { tikitok: { cost: 200, purchasedAt: Date.now() } },
      }),
    );
  }, createProject("Видео без интернета"));
  await page.goto("/beta");
  await expect(page.locator(".screenplay-editor")).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise((resolve) =>
        navigator.serviceWorker.addEventListener("controllerchange", resolve, {
          once: true,
        }),
      );
  });
  const size = await page.evaluate(
    async () => (await (await caches.match("/tikitok/video.mp4")).blob()).size,
  );
  expect(size).toBe(6748210);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".screenplay-editor")).toBeVisible();
  const ranges = await page.evaluate(async () => {
    const results = [];
    for (const range of ["bytes=0-1023", "bytes=-512", "bytes=6748210-"]) {
      const response = await fetch("/tikitok/video.mp4", {
        headers: { Range: range },
      });
      results.push({
        status: response.status,
        range: response.headers.get("Content-Range"),
        size: (await response.arrayBuffer()).byteLength,
      });
    }
    return results;
  });
  expect(ranges).toEqual([
    { status: 206, range: "bytes 0-1023/6748210", size: 1024 },
    { status: 206, range: "bytes 6747698-6748209/6748210", size: 512 },
    { status: 416, range: "bytes */6748210", size: 0 },
  ]);
  await page
    .locator('.writing-timer > button[aria-controls="writing-tikitok"]')
    .click();
  const video = page.locator("#writing-tikitok video");
  await expect
    .poll(() =>
      video.evaluate(
        (node) =>
          node.readyState >= 2 && !node.paused && node.videoHeight === 1280,
      ),
    )
    .toBe(true);
  await video.evaluate((node) => {
    node.currentTime = node.duration - 0.15;
  });
  await expect
    .poll(() =>
      video.evaluate(
        (node) =>
          !node.paused && node.currentTime > 0.02 && node.currentTime < 2,
      ),
    )
    .toBe(true);
  await page
    .getByRole("button", { name: "Закрыть TikiTok", exact: true })
    .click();
  await expect(page.locator("#writing-tikitok")).toHaveCount(0);
});

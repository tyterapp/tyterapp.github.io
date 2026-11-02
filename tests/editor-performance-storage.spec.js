import { test, expect } from "@playwright/test";
import { createProject } from "../src/data.js";

const paragraph = (format, text, blockId) => ({
  type: "paragraph", attrs: { format, blockId },
  content: [{ type: "text", text }],
});
function fixture(long = false) {
  const document = createProject("Производительность и сохранение");
  document.id = "performance-storage";
  document.content.content = [
    paragraph("scene", "ИНТ. КОМНАТА — ДЕНЬ", "scene"),
    ...Array.from({ length: long ? 450 : 3 }, (_, index) =>
      paragraph("action", "Анна смотрит на часы. Герои ждут начала съёмки. ".repeat(4), `text-${index}`)),
  ];
  document.components = Array.from({ length: long ? 80 : 1 }, (_, index) => ({
    id: index ? `person-${index}` : "anna", name: index ? `Персонаж ${index}` : "Анна", type: "character", color: "#8a799a",
  }));
  return document;
}
async function open(page, document) {
  await page.route("**/__tyter_local/**", (route) => route.fulfill({ status: 404 }));
  await page.addInitScript((document) => {
    if (sessionStorage.getItem("performance-storage-seeded")) return;
    localStorage.setItem("tyter.projects.v1", JSON.stringify([document]));
    localStorage.setItem("tyter.active", document.id);
    localStorage.setItem("tyter.onboarding.v1", "done");
    sessionStorage.setItem("performance-storage-seeded", "true");
  }, document);
  await page.goto("/free");
  await expect(page.locator(".screenplay-editor")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

test("component drop inserts the live component at the pointer and can be undone and saved", async ({ page }) => {
  await open(page, fixture());
  const target = page.locator('[data-block-id="text-1"]');
  await target.scrollIntoViewIfNeeded();
  await target.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const dataTransfer = new DataTransfer();
    dataTransfer.setData("application/x-tyter-component", JSON.stringify({ id: "anna", name: "stale name", type: "character" }));
    node.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer, clientX: rect.left + 2, clientY: rect.top + 2 }));
  });
  const before = "Анна смотрит на часы. Герои ждут начала съёмки. ".repeat(4);
  await expect(target).toHaveText(`Анна${before}`);
  await expect(target.locator('[data-entity-id="anna"]:not([data-entity-automatic])')).toHaveCount(1);
  await page.keyboard.press("Control+z");
  await expect(target).toHaveText(before);
  await page.keyboard.press("Control+Shift+z");
  await expect(target).toHaveText(`Анна${before}`);
  await page.keyboard.press("Control+s");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("tyter.projects.v1"))[0].content.content.find((block) => block.attrs.blockId === "text-1").content.map((node) => node.text || "").join(""))).toBe(`Анна${before}`);
  await page.reload();
  await expect(page.locator('[data-block-id="text-1"]')).toHaveText(`Анна${before}`);
});

test("typing does not stringify the complete screenplay to recognize its own echoed content", async ({ page }) => {
  await open(page, fixture());
  const serializations = await page.locator(".screenplay-editor").evaluate(async (node) => {
    const stringify = JSON.stringify;
    let count = 0;
    JSON.stringify = function (value, ...rest) {
      if (value?.type === "doc" && new Error().stack.includes("ScreenplayEditor.jsx")) count++;
      return stringify.call(this, value, ...rest);
    };
    try {
      node.editor.commands.setTextSelection(23);
      node.editor.commands.insertContent("Тест");
      await new Promise((resolve) => setTimeout(resolve, 100));
      return count;
    } finally {
      JSON.stringify = stringify;
    }
  });
  expect(serializations).toBe(0);
});

test("stale, disabled and malformed component drags leave the screenplay intact", async ({ page }) => {
  const document = fixture();
  document.components.push({ id: "disabled", name: "Отключённый", type: "character", enabled: false });
  await open(page, document);
  const editor = page.locator(".screenplay-editor");
  const before = await editor.evaluate((node) => node.editor.getJSON());
  await editor.evaluate((node) => {
    const rect = node.querySelector('[data-block-id="text-0"]').getBoundingClientRect();
    for (const payload of ['{"id":"unknown","name":"Другой"}', '{"id":"disabled"}', "{broken"]) {
      const dataTransfer = new DataTransfer();
      dataTransfer.setData("application/x-tyter-component", payload);
      dataTransfer.setData("text/plain", "Не вставлять");
      node.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer, clientX: rect.left + 2, clientY: rect.top + 2 }));
    }
  });
  expect(await editor.evaluate((node) => node.editor.getJSON())).toEqual(before);
});

test("a long screenplay keeps typing, undo, zoom and persisted text under CPU throttling", async ({ page }, info) => {
  test.setTimeout(120000);
  await open(page, fixture(true));
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await session.send("Performance.enable");
  await page.locator('[data-block-id="text-0"]').evaluate((node) => {
    node.editor = node.closest(".screenplay-editor").editor;
    node.editor.commands.setTextSelection(23);
    node.editor.commands.focus();
  });
  await page.waitForTimeout(300);
  await session.send("Profiler.enable");
  await session.send("Profiler.start");
  const start = await session.send("Performance.getMetrics");
  const elapsed = Date.now();
  await page.keyboard.type("Typed performance check.", { delay: 20 });
  await expect(page.locator('[data-block-id="text-0"]')).toContainText("Typed performance check.");
  await page.waitForTimeout(700);
  const finish = await session.send("Performance.getMetrics");
  const { profile } = await session.send("Profiler.stop");
  const metrics = Object.fromEntries(finish.metrics.map(({ name, value }) => [name, value]));
  const initial = Object.fromEntries(start.metrics.map(({ name, value }) => [name, value]));
  const ownSamples = new Map();
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  profile.samples?.forEach((id, index) => {
    const node = nodes.get(id);
    const key = `${node.callFrame.functionName || "anonymous"} ${node.callFrame.url.split("?")[0]}:${node.callFrame.lineNumber + 1}`;
    ownSamples.set(key, (ownSamples.get(key) || 0) + profile.timeDeltas[index] / 1000);
  });
  const report = { wallMs: Date.now() - elapsed, taskMs: (metrics.TaskDuration - initial.TaskDuration) * 1000, scriptMs: (metrics.ScriptDuration - initial.ScriptDuration) * 1000, layoutMs: (metrics.LayoutDuration - initial.LayoutDuration) * 1000, heapMB: metrics.JSHeapUsedSize / 1024 ** 2, top: [...ownSamples].sort((a, b) => b[1] - a[1]).slice(0, 25) };
  await info.attach("typing-performance", { body: JSON.stringify(report, null, 2), contentType: "application/json" });
  console.log("TYPING_PERFORMANCE", JSON.stringify(report));
  await page.keyboard.press("Control+z");
  await expect(page.locator('[data-block-id="text-0"]')).not.toContainText("Typed performance check.");
  await page.keyboard.press("Control+Shift+z");
  await expect(page.locator('[data-block-id="text-0"]')).toContainText("Typed performance check.");
  await page.getByRole("button", { name: "Настройки документа", exact: true }).click();
  await page.getByRole("slider", { name: "Масштаб документа", exact: true }).fill("150");
  await expect(page.locator(".script-paper")).toHaveCSS("zoom", "1.5");
  await page.keyboard.press("Control+s");
  await expect(page.getByRole("banner").getByRole("status")).toHaveText(/Сохранено (на устройстве|в браузере)/);
  await page.reload();
  await expect(page.locator('[data-block-id="text-0"]')).toContainText("Typed performance check.");
  await expect(page.locator(".script-paper")).toHaveCSS("zoom", "1.5");
});

import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { createProject } from "../src/data.js";

// Bounded production check, using a disposable browser profile and document.
// Usage: node checks/workspace-stress.mjs http://127.0.0.1:4181 report.json
const baseURL = process.argv[2] || "http://127.0.0.1:4181";
const document = createProject("Stress fixture");
document.id = "workspace-stress";
document.content.content = Array.from({ length: 451 }, (_, i) => ({
  type: "paragraph", attrs: { blockId: `block-${i}`, format: i ? "action" : "scene" },
  content: [{ type: "text", text: i ? "Анна смотрит на часы. Герои ждут начала съёмки. ".repeat(4) : "ИНТ. КОМНАТА — ДЕНЬ" }],
}));
document.components = Array.from({ length: 80 }, (_, i) => ({ id: `person-${i}`, type: "character", name: i ? `Персонаж ${i}` : "Анна" }));
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: "block" });
  const page = await context.newPage();
  await page.route("**/__tyter_local/**", (route) => route.fulfill({ status: 404 }));
  await page.addInitScript((doc) => {
    if (sessionStorage.getItem("stress-seeded")) return;
    localStorage.setItem("tyter.projects.v1", JSON.stringify([doc]));
    localStorage.setItem("tyter.active", doc.id);
    localStorage.setItem("tyter.onboarding.v1", "done");
    localStorage.setItem("tyter.language.v1", "ru");
    sessionStorage.setItem("stress-seeded", "yes");
  }, document);
  await page.goto(baseURL + "/free");
  await page.locator(".screenplay-editor").waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1200);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");
  await cdp.send("HeapProfiler.enable");
  const metrics = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map(({name,value}) => [name,value]));
  await cdp.send("HeapProfiler.collectGarbage");
  const initial = await metrics();
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.locator(".screenplay-editor").evaluate((node) => { node.editor.commands.setTextSelection(24); node.editor.commands.focus(); });
  const before = await metrics(), started = Date.now();
  const text = "Typed performance check.";
  await page.keyboard.type(text, { delay: 20 });
  assert.ok((await page.locator('[data-block-id="block-1"]').textContent()).includes(text));
  const typingWallMs = Date.now() - started, after = await metrics();
  await page.keyboard.press("Control+z");
  assert.ok(!(await page.locator('[data-block-id="block-1"]').textContent()).includes(text));
  await page.keyboard.press("Control+Shift+z");
  assert.ok((await page.locator('[data-block-id="block-1"]').textContent()).includes(text));
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  await page.getByRole("button", { name: "Настройки документа", exact: true }).click();
  const slider = page.getByRole("slider", { name: "Масштаб документа", exact: true });
  const zoomStart = Date.now();
  for (let i = 0; i < 10; i++) {
    await slider.fill(i % 2 ? "100" : "200");
    await page.waitForTimeout(100);
  }
  const zoomWallMs = Date.now() - zoomStart;
  await page.keyboard.press("Control+s");
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("tyter.projects.v1"))[0].content.content.some((block) => (block.content || []).some((part) => part.text?.includes("Typed performance check."))));
  await page.waitForTimeout(1000);
  await cdp.send("HeapProfiler.collectGarbage");
  const final = await metrics();
  for (let i = 0; i < 10; i++) {
    await slider.fill(i % 2 ? "100" : "200");
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(1000);
  await cdp.send("HeapProfiler.collectGarbage");
  const repeated = await metrics();
  await page.reload();
  await page.locator(".screenplay-editor").waitFor();
  assert.ok((await page.locator('[data-block-id="block-1"]').textContent()).includes(text));
  const report = {
    url: baseURL, measuredAt: new Date().toISOString(), paragraphs: 451, components: 80,
    cpuSlowdown: 4, typedCharacters: text.length, typingWallMs,
    typingTaskMs: Math.round((after.TaskDuration - before.TaskDuration) * 1000),
    typingScriptMs: Math.round((after.ScriptDuration - before.ScriptDuration) * 1000),
    typingLayoutMs: Math.round((after.LayoutDuration - before.LayoutDuration) * 1000),
    zoomChanges: 10, zoomWallMs,
    initialHeapMB: +(initial.JSHeapUsedSize / 1024 ** 2).toFixed(2),
    finalHeapMB: +(final.JSHeapUsedSize / 1024 ** 2).toFixed(2),
    initialNodes: initial.Nodes, finalNodes: final.Nodes,
    repeatedZoomHeapMB: +(repeated.JSHeapUsedSize / 1024 ** 2).toFixed(2), repeatedZoomNodes: repeated.Nodes,
    undoRedo: "passed", saveReload: "passed",
  };
  if (process.argv[3]) await writeFile(process.argv[3], JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }

import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { _electron as electron, expect } from "@playwright/test";
const root = path.resolve(import.meta.dirname, "..");
const temporary = await mkdtemp(path.join(tmpdir(), "tyter-pro-smoke-"));
const executablePath = path.join(
  root,
  "release",
  "pro",
  "win-unpacked",
  "Tyter Pro.exe",
);
let application;
const launch = () =>
  electron.launch({
    executablePath,
    timeout: 30000,
    env: { ...process.env, TYTER_DATA_ROOT: temporary },
  });
const mockInternet = () =>
  application.evaluate(() => {
    globalThis.fetch = async () => new Response("012345\n234567\n");
  });
const select = async (page, word) => {
  await page
    .locator(".screenplay-editor p")
    .last()
    .evaluate((element, word) => {
      element.closest("[contenteditable]").focus();
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const start = node.textContent.indexOf(word);
        if (start < 0) continue;
        const range = document.createRange();
        range.setStart(node, start);
        range.setEnd(node, start + word.length);
        getSelection().removeAllRanges();
        getSelection().addRange(range);
        document.dispatchEvent(new Event("selectionchange"));
        break;
      }
    }, word);
  await page.keyboard.press("Shift");
};
try {
  console.log("Launching packaged Pro...");
  application = await launch();
  console.log("Launched; waiting for activation screen...");
  let page = await application.firstWindow();
  await expect(page.locator("#license-key")).toBeVisible();
  const blocked = await page.evaluate(async () => {
    try {
      await window.tyterDesktop.request("documents");
      return false;
    } catch {
      return true;
    }
  });
  assert.equal(blocked, true);
  console.log("Activation gate and file protection passed.");
  await mockInternet();
  await page.locator("#license-key").fill("999999");
  await page.getByRole("button", { name: "Активировать", exact: true }).click();
  await expect(page.locator("#error")).toContainText("не подошёл");
  await page.locator("#license-key").fill("012345");
  await page.getByRole("button", { name: "Активировать", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Screenplay editor" }),
  ).toBeVisible();
  const tour = page.getByRole("dialog", { name: "Знакомство с редактором" });
  if (await tour.isVisible())
    await tour.getByRole("button", { name: "Закрыть обучение" }).click();
  await page.getByRole("button", { name: "Документы", exact: true }).click();
  await page
    .getByRole("button", { name: "Новый сценарий", exact: true })
    .click();
  await page.locator(".screenplay-editor").click();
  await page.keyboard.press("Control+2");
  await page.keyboard.type("Лампа и лампа.");
  await select(page, "Лампа");
  await page.keyboard.press("Control+D");
  await page
    .getByRole("dialog", { name: "Новый компонент" })
    .getByRole("button", { name: "Создать", exact: true })
    .click();
  await page.getByRole("button", { name: "Закрыть компоненты" }).click();
  await select(page, "Лампа");
  await page.keyboard.press("Control+E");
  const prop = page.getByRole("dialog", { name: "Новый реквизит" });
  await prop.getByRole("spinbutton").fill("3");
  await prop.getByRole("button", { name: "Создать", exact: true }).click();
  await expect(
    page.getByRole("complementary", { name: "Компонент и реквизит" }),
  ).toBeVisible();
  const blue = await page
    .locator(".screenplay-editor [data-entity-id]")
    .first()
    .evaluate((el) => getComputedStyle(el).color);
  assert.equal(blue, "rgb(27, 46, 255)");
  await page.getByRole("button", { name: "Открыть реквизит в списке" }).click();
  await expect(page.locator(".props-drawer")).toContainText("В тексте: 2");
  const reportPath = path.join(temporary, "props.pdf");
  await application.evaluate(({ BrowserWindow }, target) => {
    globalThis.tyterTestDownload = null;
    BrowserWindow.getAllWindows()[0].webContents.session.once(
      "will-download",
      (_event, item) => {
        item.setSavePath(target);
        item.once("done", (_event, state) => {
          globalThis.tyterTestDownload = state;
        });
      },
    );
  }, reportPath);
  await page.getByRole("button", { name: "Скачать отчёт реквизита" }).click();
  await expect
    .poll(() => application.evaluate(() => globalThis.tyterTestDownload), {
      timeout: 20000,
    })
    .toBe("completed");
  assert.ok((await readFile(reportPath)).subarray(0, 5).toString() === "%PDF-");
  console.log("Combined sidebar and prop report passed.");
  await page.getByRole("button", { name: "Закрыть реквизит" }).click();
  assert.equal(
    await page
      .locator(".screenplay-editor .script-prop")
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor),
    "rgba(0, 0, 0, 0)",
  );
  await page
    .locator(".screenplay-editor [data-entity-id]")
    .first()
    .click({ modifiers: ["Control"] });
  await expect(page.locator(".annotations-drawer")).toBeVisible();
  await page
    .getByRole("button", { name: "Открыть компонент в списке" })
    .click();
  await expect(
    page.locator(".components-drawer:not(.props-drawer) input").nth(1),
  ).toHaveValue("Лампа");
  await page.locator(".component-editor input").first().fill("Светильник");
  await page.locator(".component-editor").getByRole("button",{name:"Сохранить",exact:true}).click();
  await expect(page.locator(".annotations-drawer")).toBeVisible();
  await expect(page.locator(".annotations-drawer .annotation-section").last().locator("input").first()).toHaveValue("Светильник");
  await expect(page.locator(".screenplay-editor")).toContainText("Светильник и Светильник.");
  await page.getByRole("button",{name:"Закрыть детали текста"}).click();
  await page.evaluate(() => window.dispatchEvent(new Event("tyter:save-now")));
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.tyterDesktop.request("documents")))
          .documents.length,
    )
    .toBe(3);
  const saved = JSON.parse(
    await readFile(path.join(temporary, "Profile", "activation.json"), "utf8"),
  );
  assert.ok(saved.value);
  await application.close();
  application = null;
  // The next launch reads the saved code before opening the editor. A test preload
  // supplies the remote list only in the test process, without changing the app.
  const mockFile = path.join(temporary, "network.cjs");
  await writeFile(
    mockFile,
    'globalThis.fetch=async()=>new Response("012345\\n234567\\n");',
  );
  application = await electron.launch({
    executablePath,
    args: ["--require", mockFile],
    env: { ...process.env, TYTER_DATA_ROOT: temporary },
  });
  page = await application.firstWindow();
  // Some packaged Electron versions ignore --require. In that case verify the
  // saved-code recovery path after a real network failure, without entering it.
  await expect
    .poll(() => page.url(), { timeout: 20000 })
    .toMatch(/tyter:\/\/app\//);
  if (page.url().includes("activate.html")) {
    console.log("Saved code was rechecked; retrying after unavailable public file without re-entering it.");
    await expect(page.locator("#retry-button")).toBeVisible();
    await mockInternet();
    await page.locator("#retry-button").click();
  }
  await expect(page.locator(".screenplay-editor")).toBeVisible();
  await expect(page.locator("#license-key")).toHaveCount(0);
  console.log(
    "Pro smoke passed: activation, invalid code, protected files, third document, combined details, blue priority, prop PDF and saved-code retry.",
  );
} finally {
  if (application) await application.close();
  const resolved = path.resolve(temporary);
  if (
    !resolved.startsWith(path.resolve(tmpdir()) + path.sep) ||
    !path.basename(resolved).startsWith("tyter-pro-smoke-")
  )
    throw new Error("Unsafe temporary directory");
  await rm(resolved, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 300,
  });
}

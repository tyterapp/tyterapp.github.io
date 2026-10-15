import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";
import { createProject } from "../../src/data.js";
import { grantPro } from "../helpers/pro-access.js";
import { selectAppOption } from "../helpers/app-select.js";

test("XLSX shot report can load its exporter for the first time offline", async ({
  page,
  context,
}, info) => {
  const document = createProject("Отчёт без интернета");
  document.content.content = [
    {
      type: "paragraph",
      attrs: { format: "scene", blockId: "scene", sceneVariant: "A" },
      content: [{ type: "text", text: "ИНТ. ДОМ — НОЧЬ" }],
    },
    {
      type: "paragraph",
      attrs: { format: "action", blockId: "action" },
      content: [{ type: "text", text: "Текст офлайн-отчёта." }],
    },
  ];
  await grantPro(page);
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  await page.addInitScript((document) => {
    localStorage.setItem("tyter.projects.v1", JSON.stringify([document]));
    localStorage.setItem("tyter.active", document.id);
    localStorage.setItem("tyter.language.v1", "ru");
  }, document);
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
  expect(
    await page.evaluate(() =>
      performance
        .getEntriesByType("resource")
        .some((entry) => entry.name.includes("shot-report-xlsx")),
    ),
  ).toBe(false);
  await context.setOffline(true);
  await page.locator(".scene-shot-button").first().click();
  const drawer = page.locator(".shot-info-drawer");
  await selectAppOption(
    page,
    drawer.getByRole("combobox", { name: "Формат отчёта" }),
    "xlsx",
  );
  const pending = page.waitForEvent("download");
  await drawer
    .getByRole("button", { name: "XLSX-отчёт по всем сценам" })
    .click();
  const download = await pending;
  const path = info.outputPath("offline-report.xlsx");
  await download.saveAs(path);
  const files = unzipSync(await readFile(path));
  expect(strFromU8(files["xl/sharedStrings.xml"])).toContain(
    "Текст офлайн-отчёта.",
  );
});

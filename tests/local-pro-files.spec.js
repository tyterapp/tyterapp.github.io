import { test, expect } from "@playwright/test";
import { grantPro } from "./helpers/pro-access.js";
test("Pro autosaves complete TYT projects to the chosen local directory", async ({
  page,
}) => {
  await grantPro(page);
  let serverFilesRequested = false;
  page.on("request", (request) => {
    if (request.url().includes("/__tyter_local/")) serverFilesRequested = true;
  });
  await page.addInitScript(() => {
    localStorage.setItem("tyter.onboarding.v1", "done");
    // A real cloneable browser FileSystemDirectoryHandle, without an OS dialog in automation.
    window.showDirectoryPicker = async () =>
      (await navigator.storage.getDirectory()).getDirectoryHandle(
        "tyter-test",
        { create: true },
      );
  });
  await page.goto("/pro");
  await expect(page.locator(".screenplay-editor")).toBeVisible();
  await page.getByRole("button", { name: "Открыть папку сценариев" }).click();
  await expect(page.getByRole("alert")).toContainText("Подключена папка");
  await page.getByRole("button", { name: "Настройки документа" }).click();
  await page.getByLabel("Автор", { exact: true }).fill("Локальный автор");
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const directory = await (
          await navigator.storage.getDirectory()
        ).getDirectoryHandle("tyter-test");
        const files = [];
        for await (const entry of directory.values())
          if (entry.kind === "file")
            files.push(JSON.parse(await (await entry.getFile()).text()));
        return files.some(
          (payload) => payload.document.metadata.author === "Локальный автор",
        );
      }),
    )
    .toBe(true);
  expect(serverFilesRequested).toBe(false);
  await page.reload();
  await page.getByRole("button", { name: "Настройки документа" }).click();
  await expect(page.getByLabel("Автор", { exact: true })).toHaveValue(
    "Локальный автор",
  );
  await page.getByRole("button", { name: "Документы", exact: true }).click();
  await page.getByRole("button", { name: "Новый сценарий" }).click();
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const { browserRequest } = await import("/src/browser-files.js");
        return (await browserRequest("documents")).documents.length;
      }),
    )
    .toBe(3);
  const selected = await page.evaluate(() =>
    localStorage.getItem("tyter.active"),
  );
  const selectedName = await page.evaluate(async (id) => {
    const directory = await (
      await navigator.storage.getDirectory()
    ).getDirectoryHandle("tyter-test");
    for await (const entry of directory.values()) {
      if (entry.kind !== "file") continue;
      const payload = JSON.parse(await (await entry.getFile()).text());
      if (payload.document.id === id) return entry.name;
    }
  }, selected);
  expect(selectedName).toBe("Без названия (2).tyt");
  await page.evaluate(async (id) => {
    const { deleteLocalFile } = await import("/src/local-files.js");
    await deleteLocalFile(id);
  }, selected);
  expect(
    await page.evaluate(async (name) => {
      const directory = await (
        await navigator.storage.getDirectory()
      ).getDirectoryHandle("tyter-test");
      try {
        await directory.getFileHandle(name);
        return true;
      } catch (error) {
        if (error.name !== "NotFoundError") throw error;
        return false;
      }
    }, selectedName),
  ).toBe(false);
});

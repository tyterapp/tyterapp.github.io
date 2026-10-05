import { test, expect } from "@playwright/test";
import { createProject } from "../src/data.js";
import { documentFileStem } from "../src/local-file-names.js";

const project = (id, title) => ({ ...createProject(title), id });
async function openFolder(page, legacy = []) {
  await page.goto("/404");
  return page.evaluate(async (legacy) => {
    const folder = await (
      await navigator.storage.getDirectory()
    ).getDirectoryHandle("named-files", { create: true });
    for (const document of legacy) {
      const file = await folder.getFileHandle(document.id + ".tyt", {
        create: true,
      });
      const writable = await file.createWritable();
      const { tytPayload } = await import("/src/tyt-format.js");
      await writable.write(JSON.stringify(tytPayload(document)));
      await writable.close();
    }
    window.showDirectoryPicker = async () => folder;
    const { chooseLocalDirectory } = await import("/src/browser-files.js");
    return chooseLocalDirectory();
  }, legacy);
}
const save = (page, documents) =>
  page.evaluate(async (documents) => {
    const { browserRequest } = await import("/src/browser-files.js");
    return browserRequest("documents", { documents });
  }, documents);
const files = (page) =>
  page.evaluate(async () => {
    const folder = await (
      await navigator.storage.getDirectory()
    ).getDirectoryHandle("named-files");
    const entries = {};
    for await (const entry of folder.values())
      if (entry.kind === "file")
        entries[entry.name] = await (await entry.getFile()).text();
    return entries;
  });

test("existing ID-named files migrate to titles and renames persist without duplicates", async ({
  page,
}) => {
  const cat = project("cat-id", "Глазами кошки");
  const untitled = project("untitled-id", "Без названия");
  const imported = await openFolder(page, [cat, untitled]);
  expect(imported.documents.map((document) => document.id).sort()).toEqual([
    "cat-id",
    "untitled-id",
  ]);
  await save(page, [cat, untitled]);
  expect(Object.keys(await files(page)).sort()).toEqual([
    "Без названия.tyt",
    "Глазами кошки.tyt",
  ]);
  cat.title = "Ночной город";
  await save(page, [cat, untitled]);
  expect(Object.keys(await files(page)).sort()).toEqual([
    "Без названия.tyt",
    "Ночной город.tyt",
  ]);
  cat.title = "ночной город";
  await save(page, [cat, untitled]);
  expect(Object.keys(await files(page)).sort()).toEqual([
    "Без названия.tyt",
    "ночной город.tyt",
  ]);
  expect(JSON.parse((await files(page))["ночной город.tyt"]).document).toEqual(
    cat,
  );
  await page.reload();
  await save(page, [cat, untitled]);
  expect(Object.keys(await files(page)).sort()).toEqual([
    "Без названия.tyt",
    "ночной город.tyt",
  ]);
  const reopened = await page.evaluate(async () => {
    window.showDirectoryPicker = async () =>
      (await navigator.storage.getDirectory()).getDirectoryHandle(
        "named-files",
      );
    const { chooseLocalDirectory } = await import("/src/browser-files.js");
    return chooseLocalDirectory();
  });
  expect(reopened.documents.map((document) => document.title).sort()).toEqual([
    "Без названия",
    "ночной город",
  ]);
});

test("duplicate titles keep stable numbered names and preserve unrelated files and manual backups", async ({
  page,
}) => {
  await openFolder(page);
  const first = project("first-cat", "Кошка");
  const second = project("second-cat", "Кошка");
  await page.evaluate(async () => {
    const folder = await (
      await navigator.storage.getDirectory()
    ).getDirectoryHandle("named-files");
    const stream = await (
      await folder.getFileHandle("Кошка.tyt", { create: true })
    ).createWritable();
    await stream.write("Файл другого приложения");
    await stream.close();
  });
  await save(page, [first, second]);
  let result = await files(page);
  expect(Object.keys(result).sort()).toEqual([
    "Кошка (2).tyt",
    "Кошка (3).tyt",
    "Кошка.tyt",
  ]);
  expect(result["Кошка.tyt"]).toBe("Файл другого приложения");
  expect(JSON.parse(result["Кошка (2).tyt"]).document.id).toBe(first.id);
  expect(JSON.parse(result["Кошка (3).tyt"]).document.id).toBe(second.id);
  await save(page, [second, first]);
  result = await files(page);
  expect(JSON.parse(result["Кошка (2).tyt"]).document.id).toBe(first.id);
  expect(JSON.parse(result["Кошка (3).tyt"]).document.id).toBe(second.id);
  first.title = "Дом";
  second.title = "Сад";
  await save(page, [first, second]);
  await page.evaluate(async () => {
    const folder = await (
      await navigator.storage.getDirectory()
    ).getDirectoryHandle("named-files");
    const copy = await (await folder.getFileHandle("Дом.tyt")).getFile();
    const stream = await (
      await folder.getFileHandle("Ручная копия.tyt", { create: true })
    ).createWritable();
    await stream.write(await copy.text());
    await stream.close();
    const { browserRequest } = await import("/src/browser-files.js");
    await browserRequest("delete-document", { id: "first-cat" });
    await browserRequest("delete-document", { id: "first-cat" });
  });
  result = await files(page);
  expect(Object.keys(result).sort()).toEqual([
    "Кошка.tyt",
    "Ручная копия.tyt",
    "Сад.tyt",
  ]);
  expect(result["Кошка.tyt"]).toBe("Файл другого приложения");
  expect(JSON.parse(result["Ручная копия.tyt"]).document.id).toBe(first.id);
});

test("an interrupted rename keeps the original and retries cleanup after a successful write", async ({
  page,
}) => {
  const document = project("rename-test", "Первое имя");
  await openFolder(page, [document]);
  await save(page, [document]);
  document.title = "Второе имя";
  const failedWrite = await page.evaluate(async (document) => {
    const original = FileSystemFileHandle.prototype.createWritable;
    FileSystemFileHandle.prototype.createWritable = function (...args) {
      if (this.name === "Второе имя.tyt")
        throw new DOMException("Test write failure", "NotAllowedError");
      return original.apply(this, args);
    };
    try {
      const { browserRequest } = await import("/src/browser-files.js");
      await browserRequest("documents", { documents: [document] });
      return false;
    } catch {
      return true;
    } finally {
      FileSystemFileHandle.prototype.createWritable = original;
    }
  }, document);
  expect(failedWrite).toBe(true);
  expect(Object.keys(await files(page))).toEqual(["Первое имя.tyt"]);
  const failedCleanup = await page.evaluate(async (document) => {
    const original = FileSystemDirectoryHandle.prototype.removeEntry;
    FileSystemDirectoryHandle.prototype.removeEntry = function (name, ...args) {
      if (name === "Первое имя.tyt")
        throw new DOMException("Test cleanup failure", "NotAllowedError");
      return original.call(this, name, ...args);
    };
    try {
      const { browserRequest } = await import("/src/browser-files.js");
      await browserRequest("documents", { documents: [document] });
      return false;
    } catch {
      return true;
    } finally {
      FileSystemDirectoryHandle.prototype.removeEntry = original;
    }
  }, document);
  expect(failedCleanup).toBe(true);
  expect(Object.keys(await files(page)).sort()).toEqual([
    "Второе имя.tyt",
    "Первое имя.tyt",
  ]);
  await page.reload();
  await save(page, [document]);
  expect(Object.keys(await files(page))).toEqual(["Второе имя.tyt"]);
  expect(JSON.parse((await files(page))["Второе имя.tyt"]).document).toEqual(
    document,
  );
});

test("filenames keep Russian text and remain valid for Windows and long Unicode titles", async () => {
  expect(documentFileStem("Глазами кошки")).toBe("Глазами кошки");
  expect(documentFileStem('Кошка: "окно" / день?')).toBe(
    "Кошка_ _окно_ _ день_",
  );
  expect(documentFileStem("CON.txt")).toBe("_CON.txt");
  expect(documentFileStem("... ")).toBe("Без названия");
  const long = documentFileStem("劇🎬".repeat(160));
  expect(Buffer.byteLength(long)).toBeLessThanOrEqual(220);
  expect(long).not.toContain("�");
});

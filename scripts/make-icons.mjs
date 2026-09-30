import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "build-resources");
await mkdir(output, { recursive: true });
const logo = await readFile(path.join(root, "public", "brand", "tyter-logo.svg"), "utf8");

function icoFromPng(png) {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18);
  return Buffer.concat([header, png]);
}

const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 256, height: 256 },
    deviceScaleFactor: 1,
  });
  for (const edition of ["free", "pro"]) {
    await page.setContent(
      `<html><body style="margin:0">${logo.replace('width="198" height="198"', 'width="256" height="256"')}</body></html>`,
    );
    const png = await page.locator("svg").screenshot();
    await writeFile(path.join(output, `${edition}.ico`), icoFromPng(png));
  }
} finally {
  await browser.close();
}

import { test, expect } from "@playwright/test";
import { createProject } from "../src/data.js";
import { writeFile } from "node:fs/promises";

const block = (format, text, id, sceneVariant) => ({
  type: "paragraph",
  attrs: { format, blockId: id, ...(sceneVariant ? { sceneVariant } : {}) },
  content: [{ type: "text", text }],
});

for (const fontSize of [12, 26]) {
  test(`PDF prints each active scene number and variant once beside the heading at ${fontSize}pt`, async ({
    page,
  }, info) => {
    const doc = createProject("Номера и варианты сцен");
    doc.metadata = { ...doc.metadata, fontSize, author: "Автор" };
    doc.content.content = [
      block("scene", "ИНТ. СЦЕНА-1 — ДЕНЬ", "scene-1"),
      block(
        "action",
        "Кошка наблюдает за улицей. Мимо проходят люди и проезжают машины. ".repeat(
          65,
        ),
        "action-1",
      ),
      block(
        "scene",
        `ЭКС. СЦЕНА-2 ${"ОЧЕНЬ ДЛИННОЕ НАЗВАНИЕ ПЛОЩАДКИ ".repeat(65)} — НОЧЬ`,
        "scene-2",
        "B",
      ),
      ...["C", "D", "E", "F"].flatMap((variant, i) => [
        block("scene", `ИНТ. СЦЕНА-${i + 3} — ДЕНЬ`, `scene-${i + 3}`, variant),
        block(
          "action",
          `Действие выбранного варианта ${variant}.`,
          `action-${i + 3}`,
        ),
      ]),
    ];
    doc.sceneVariants = {
      "scene-6": { A: [block("scene", "НЕАКТИВНЫЙ ВАРИАНТ", "scene-6", "A")] },
    };
    await page.goto("/free");
    const result = await page.evaluate(async (doc) => {
      const { exportPDF } = await import("/src/exports.js");
      const pdfjs = await import("/node_modules/.vite/deps/pdfjs-dist.js");
      pdfjs.GlobalWorkerOptions.workerSrc =
        "/node_modules/pdfjs-dist/build/pdf.worker.min.mjs";
      const blob = await exportPDF(doc);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const task = pdfjs.getDocument({
        data: bytes.slice(),
        isEvalSupported: false,
      });
      const pdf = await task.promise;
      const items = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const content = await (await pdf.getPage(i)).getTextContent();
        items.push(
          ...content.items
            .filter((item) => item.str?.trim())
            .map((item) => ({
              text: item.str,
              x: item.transform[4],
              y: item.transform[5],
              width: item.width,
              height: item.height,
              page: i,
            })),
        );
      }
      const first = items.find((item) => item.text.includes("СЦЕНА-1"));
      const second = items.find((item) => item.text.includes("СЦЕНА-2"));
      const previews = [];
      for (const number of new Set([first.page, second.page])) {
        const page = await pdf.getPage(number);
        const viewport = page.getViewport({ scale: 1 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext("2d"), viewport })
          .promise;
        previews.push({ page: number, image: canvas.toDataURL() });
      }
      await task.destroy();
      return { items, previews, bytes: Array.from(bytes), pages: pdf.numPages };
    }, doc);
    await writeFile(
      info.outputPath("scene-labels.pdf"),
      Buffer.from(result.bytes),
    );
    await writeFile(
      info.outputPath("text.json"),
      JSON.stringify(result.items, null, 2),
    );
    for (const preview of result.previews)
      await writeFile(
        info.outputPath(`page-${preview.page}.png`),
        Buffer.from(preview.image.split(",")[1], "base64"),
      );
    // PDF.js can split the number and letter into separate text items at a space.
    const labels = result.items
      .filter((item) => /^[A-F]$/.test(item.text) && item.height === 9)
      .map((letter) => {
        const number = result.items.find(
          (item) =>
            /^\d+$/.test(item.text) &&
            item.page === letter.page &&
            item.y === letter.y &&
            Math.abs(letter.x - item.x - item.width - 5.4) < 0.1,
        );
        expect(number).toBeDefined();
        return {
          ...letter,
          text: `${number.text} ${letter.text}`,
          x: number.x,
          width: letter.x + letter.width - number.x,
        };
      });
    expect(labels.map((item) => item.text)).toEqual([
      "1 A",
      "2 B",
      "3 C",
      "4 D",
      "5 E",
      "6 F",
    ]);
    expect(result.items.map((item) => item.text).join(" ")).not.toContain(
      "НЕАКТИВНЫЙ ВАРИАНТ",
    );
    for (let i = 0; i < labels.length; i++) {
      const heading = result.items.find((item) =>
        item.text.includes(`СЦЕНА-${i + 1}`),
      );
      const label = labels[i];
      expect(label.page).toBe(heading.page);
      expect(label.page).toBeGreaterThan(1);
      expect(label.x).toBeGreaterThan(0);
      expect(label.x + label.width).toBeLessThanOrEqual(heading.x - 17);
      expect(
        Math.abs(label.y + label.height / 2 - heading.y - heading.height / 2),
      ).toBeLessThan(1);
    }
    expect(labels[1].page).toBeGreaterThan(labels[0].page);
    expect(result.pages).toBeGreaterThan(3);
  });
}

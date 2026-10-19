import { zipSync, strToU8 } from "fflate";
import { storyboardScenes } from "./storyboard-model.js";
import { storyboardFrames, STORY_STATUSES } from "./storyboard-data.js";
import { shotAspectRatio } from "./shot-image.js";
import { getLanguage } from "./i18n.js";

export function storyboardManifest(document, { images = true } = {}) {
  return {
    format: "tyter-storyboard",
    version: 1,
    title: document.title,
    scenes: storyboardScenes(document).map((scene) => ({
      id: scene.id,
      number: scene.number,
      variant: scene.letter,
      title: scene.title,
      screenplayPage: scene.page,
      pageColor: scene.color,
      settings: Object.fromEntries(
        Object.entries(scene.settings).filter(
          ([key]) => !["image", "frames"].includes(key),
        ),
      ),
      blocks: scene.blocks,
      frames: storyboardFrames(scene.settings).map((frame, index) => ({
        id: frame.id,
        number: index + 1,
        durationMs: frame.durationMs,
        transition: frame.transition,
        ...(images ? { image: frame.image || null } : {}),
      })),
    })),
  };
}
const filename = (scene, index, extension) =>
  `scene-${String(scene.number).padStart(3, "0")}-${scene.letter}_frame-${String(index + 1).padStart(3, "0")}.${extension}`;
async function frameCanvas(scene, frame) {
  const ratio = shotAspectRatio(scene.settings.aspectRatio) || 16 / 9;
  const bitmap = frame.image
    ? await createImageBitmap(await (await fetch(frame.image)).blob())
    : null;
  const canvas = document.createElement("canvas");
  const width = bitmap
    ? Math.min(bitmap.width, bitmap.height * ratio, 4096)
    : 1280;
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(width / ratio));
  const context = canvas.getContext("2d");
  context.fillStyle = "#f2f0f6";
  context.fillRect(0, 0, canvas.width, canvas.height);
  if (bitmap) {
    const sourceWidth = Math.min(bitmap.width, bitmap.height * ratio),
      sourceHeight = sourceWidth / ratio;
    context.drawImage(
      bitmap,
      (bitmap.width - sourceWidth) / 2,
      (bitmap.height - sourceHeight) / 2,
      sourceWidth,
      sourceHeight,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    bitmap.close();
  }
  return canvas;
}
async function sequence(document, format) {
  const files = {},
    manifest = storyboardManifest(document, { images: false });
  for (const [sceneIndex, scene] of storyboardScenes(document).entries()) {
    for (const [index, frame] of storyboardFrames(scene.settings).entries()) {
      const canvas = await frameCanvas(scene, frame);
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, `image/${format}`, 0.95),
      );
      if (!blob || blob.type !== `image/${format}`)
        throw new Error(
          getLanguage() === "en"
            ? "This browser cannot export this image format."
            : "Браузер не поддерживает экспорт в этот формат.",
        );
      const file = filename(scene, index, format);
      files[file] = new Uint8Array(await blob.arrayBuffer());
      manifest.scenes[sceneIndex].frames[index].file = file;
      canvas.width = canvas.height = 1;
    }
  }
  files["storyboard.json"] = strToU8(JSON.stringify(manifest, null, 2));
  return new Blob([zipSync(files, { level: 0 })], { type: "application/zip" });
}
async function pdfStoryboard(document) {
  const [{ jsPDF }, { getFonts }] = await Promise.all([
    import("jspdf"),
    import("./exports.js"),
  ]);
  const fonts = await getFonts();
  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "pt",
    format: "a4",
    compress: true,
  });
  for (const { style, base64 } of fonts) {
    pdf.addFileToVFS(`Story-${style}.ttf`, base64);
    pdf.addFont(
      `Story-${style}.ttf`,
      "Story",
      {
        Regular: "normal",
        Bold: "bold",
        Italic: "italic",
        BoldItalic: "bolditalic",
      }[style],
    );
  }
  pdf.setFont("Story", "normal");
  pdf.setProperties({
    title: `${document.title} - Storyboard`,
    creator: "Tyter",
  });
  const english = getLanguage() === "en",
    width = pdf.internal.pageSize.getWidth(),
    height = pdf.internal.pageSize.getHeight();
  const entries = storyboardScenes(document).flatMap((scene) => {
    const frames = storyboardFrames(scene.settings);
    return (frames.length ? frames : [{ image: "", durationMs: 0 }]).map(
      (frame, index) => ({ scene, frame, index }),
    );
  });
  const cellWidth = (width - 100) / 2,
    cellHeight = (height - 124) / 2;
  if (!entries.length) {
    pdf.setFontSize(16);
    pdf.text(english ? "No scenes yet" : "Пока нет сцен", 40, 85);
  }
  for (let i = 0; i < entries.length; i++) {
    if (i && i % 4 === 0) pdf.addPage();
    const { scene, frame, index } = entries[i],
      col = i % 2,
      row = Math.floor((i % 4) / 2),
      x = 40 + col * (cellWidth + 20),
      y = 64 + row * (cellHeight + 12);
    const ratio = shotAspectRatio(scene.settings.aspectRatio) || 16 / 9;
    const boxHeight = cellHeight - 68,
      imageWidth = Math.min(cellWidth, boxHeight * ratio),
      imageHeight = imageWidth / ratio;
    pdf.setFillColor(244, 242, 247);
    pdf.roundedRect(x, y, cellWidth, boxHeight, 5, 5, "F");
    const canvas = await frameCanvas(scene, frame);
    pdf.addImage(
      canvas.toDataURL("image/jpeg", 0.94),
      "JPEG",
      x + (cellWidth - imageWidth) / 2,
      y + (boxHeight - imageHeight) / 2,
      imageWidth,
      imageHeight,
    );
    canvas.width = canvas.height = 1;
    pdf.setTextColor(48, 43, 55);
    pdf.setFont("Story", "bold");
    pdf.setFontSize(10);
    pdf.text(
      `${scene.number} ${scene.letter} / ${index + 1}  -  ${frame.durationMs / 1000}s`,
      x,
      y + boxHeight + 16,
    );
    pdf.setFont("Story", "normal");
    pdf.setFontSize(9);
    const title = pdf.splitTextToSize(
      scene.title || (english ? "Untitled" : "Без названия"),
      cellWidth,
    );
    pdf.text(title.slice(0, 2), x, y + boxHeight + 30);
    const state =
      STORY_STATUSES.find(([id]) => id === scene.settings.status) ||
      STORY_STATUSES[0];
    pdf.setTextColor(110, 102, 119);
    pdf.setFontSize(8);
    pdf.text(
      `${english ? "Act" : "Акт"} ${scene.settings.act || 1}  /  ${state[english ? 2 : 1]}  /  ${english ? "Drama" : "Драматичность"} ${scene.settings.drama || 0}/10`,
      x,
      y + cellHeight - 5,
    );
  }
  for (let i = 1; i <= pdf.getNumberOfPages(); i++) {
    pdf.setPage(i);
    pdf.setFont("Story", "bold");
    pdf.setFontSize(14);
    pdf.setTextColor(48, 43, 55);
    pdf.text(
      pdf.splitTextToSize(document.title || "Tyter", width - 240).slice(0, 1),
      40,
      34,
    );
    pdf.setFont("Story", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(110, 102, 119);
    pdf.text(english ? "STORYBOARD" : "РАСКАДРОВКА", width - 40, 34, {
      align: "right",
    });
    pdf.text(`${i} / ${pdf.getNumberOfPages()}`, width - 40, height - 22, {
      align: "right",
    });
  }
  return pdf.output("blob");
}
export async function exportStoryboard(document, format) {
  if (format === "json")
    return new Blob([JSON.stringify(storyboardManifest(document), null, 2)], {
      type: "application/json",
    });
  if (format === "png" || format === "webp") return sequence(document, format);
  if (format === "pdf") return pdfStoryboard(document);
  throw new Error("Unknown storyboard format");
}

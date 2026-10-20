import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createCanvas, loadImage } from "@napi-rs/canvas";

// Resize the supplied artwork without redrawing it. Opaque backgrounds prevent
// black corners when iOS applies its own home-screen icon mask.
const directory = new URL("../public/telegraph/", import.meta.url);
const source = await loadImage(
  await readFile(new URL("icon-source.png", directory)),
);
for (const [name, size, inset = 0] of [
  ["favicon-32.png", 32],
  ["apple-touch-icon.png", 180],
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["icon-maskable-512.png", 512, 0.1],
]) {
  const canvas = createCanvas(size, size);
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, size, size);
  const padding = size * inset;
  context.drawImage(
    source,
    padding,
    padding,
    size - padding * 2,
    size - padding * 2,
  );
  await writeFile(new URL(name, directory), await canvas.encode("png"));
}
console.log(`Telegraph icons: ${fileURLToPath(directory)}`);

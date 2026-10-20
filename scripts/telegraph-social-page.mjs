import { writeFile } from "node:fs/promises";
import path from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";

// Use the exact key artwork from /pro and /free on a social-sized canvas.
export async function writeTelegraphSocialPage(output) {
  const canvas = createCanvas(1200, 630);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#f7f7fa";
  ctx.fillRect(0, 0, 1200, 630);
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.roundRect(24, 24, 1152, 582, 28);
  ctx.fill();
  const logo = await loadImage(path.join(output, "brand", "tyter-logo.svg"));
  ctx.drawImage(logo, 60, 52, 52, 52);
  const key = await loadImage(path.join(output, "telegraph", "normal.png"));
  ctx.drawImage(key, 220, 130, 760, (760 * key.height) / key.width);
  await writeFile(
    path.join(output, "telegraph", "cover.png"),
    await canvas.encode("png"),
  );
}

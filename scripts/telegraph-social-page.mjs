import { copyFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";

// Keep the previous image URL working; the versioned URL refreshes cached previews.
export async function writeTelegraphSocialPage(output) {
  await copyFile(
    path.join(output, "telegraph", "cover-white-v1.png"),
    path.join(output, "telegraph", "cover.png"),
  );
  // A separate, lightweight image URL lets X fetch a fresh card asset while
  // keeping the supplied PNG unchanged for Open Graph and Telegram.
  const image = await loadImage(
    path.join(output, "telegraph", "cover-white-v1.png"),
  );
  const canvas = createCanvas(1200, 630);
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, 1200, 630);
  context.drawImage(image, 0, 0, 1200, 630);
  await writeFile(
    path.join(output, "telegraph", "cover-x-v2.jpg"),
    await canvas.encode("jpeg", 90),
  );
}

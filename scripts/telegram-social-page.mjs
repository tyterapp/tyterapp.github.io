import { writeFile } from "node:fs/promises";
import path from "node:path";
import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";
import { paintTelegramCover } from "../src/telegram-cover.js";

// Static hosts can only supply a generic preview. Personal covers are produced
// by the browser or the optional sharing service, never by client-side OG tags.
export async function writeTelegramSocialPage(output) {
  GlobalFonts.registerFromPath(
    path.join(output, "fonts", "Cousine-Regular.ttf"),
    "Telegram Courier",
  );
  const canvas = createCanvas(1200, 630);
  const logo = await loadImage(path.join(output, "brand", "tyter-logo.svg"));
  paintTelegramCover(
    canvas,
    { text: "Телеграмма для тебя.\n\nСлова оживают под звуки Морзе." },
    "https://tyterapp.github.io/telegram/",
    logo,
  );
  await writeFile(
    path.join(output, "telegram", "cover.png"),
    await canvas.encode("png"),
  );
}

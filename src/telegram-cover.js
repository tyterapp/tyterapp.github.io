import QRCode from "qrcode";
import { readTelegram, telegramDescriptor } from "./telegram.js";

function personalDestination(telegram, link) {
  try {
    const url = new URL(link);
    if (
      !/^https?:$/.test(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname.replace(/\/$/, "") !== "/telegram"
    )
      return false;
    const embedded = readTelegram(url.hash);
    if (embedded) {
      const expected = telegramDescriptor({
        version: 1,
        ...telegram,
        language: telegram.language || embedded.language,
      });
      return (
        !!expected &&
        embedded.text === expected.text &&
        embedded.language === expected.language &&
        (embedded.title || "") === (expected.title || "")
      );
    }
    return !url.hash && /^[a-f\d]{32}$/.test(url.searchParams.get("id") || "");
  } catch {
    return false;
  }
}

// Same local renderer is used by the browser download and the public service.
export function paintTelegramCover(canvas, telegram, link, logo) {
  canvas.width = 1200;
  canvas.height = 630;
  const context = canvas.getContext("2d");
  context.fillStyle = "#f3f0e9";
  context.fillRect(0, 0, 1200, 630);
  context.fillStyle = "#fffdf7";
  context.fillRect(24, 24, 1152, 582);
  if (logo) context.drawImage(logo, 64, 56, 64, 64);
  context.fillStyle = "#302c37";
  context.font = '36px "Telegram Courier", "Courier New", monospace';
  context.fillText("Tyter", logo ? 144 : 64, 102);
  context.fillStyle = "#302c37";
  context.font = '32px "Telegram Courier", "Courier New", monospace';
  const lines = [];
  let line = "";
  for (const character of telegram.text) {
    if (character === "\n") {
      lines.push(line);
      line = "";
    } else if (context.measureText(line + character).width > 720) {
      lines.push(line);
      line = character;
    } else line += character;
    if (lines.length >= 7) break;
  }
  if (lines.length < 7 && line) lines.push(line);
  if (
    lines.join("").length < telegram.text.replaceAll("\n", "").length &&
    lines.length
  ) {
    let last = lines.at(-1);
    while (context.measureText(last + "…").width > 720)
      last = last.slice(0, -1);
    lines[lines.length - 1] = last + "…";
  }
  lines.forEach((text, index) => context.fillText(text, 64, 190 + index * 48));
  let qrAvailable = false;
  try {
    // Generic landing URLs and mismatched snapshots must never produce a QR.
    if (!personalDestination(telegram, link)) return { qrAvailable };
    const { modules } = QRCode.create(link, { errorCorrectionLevel: "L" });
    // An integer module size and four-module quiet zone keep the code scannable.
    const size = Math.floor(288 / (modules.size + 8));
    if (size < 1) throw new Error("QR too dense");
    const width = size * (modules.size + 8),
      x = Math.round(850 + (288 - width) / 2),
      y = 234;
    context.fillStyle = "#ffffff";
    context.fillRect(x, y, width, width);
    context.fillStyle = "#302c37";
    for (let row = 0; row < modules.size; row++)
      for (let col = 0; col < modules.size; col++)
        if (modules.get(row, col))
          context.fillRect(
            x + (col + 4) * size,
            y + (row + 4) * size,
            size,
            size,
          );
    qrAvailable = true;
  } catch {
    /* Long offline URLs exceed QR capacity. Never draw a false code. */
  }
  return { qrAvailable };
}

export async function telegramCover(telegram, link) {
  const canvas = document.createElement("canvas");
  const logo = new Image();
  logo.src = "/brand/tyter-logo.svg";
  try {
    await logo.decode();
  } catch {
    /* The typographic logo works offline too. */
  }
  const result = paintTelegramCover(
    canvas,
    telegram,
    link,
    logo.naturalWidth ? logo : null,
  );
  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new Error("Could not render telegram cover");
  return { ...result, blob };
}

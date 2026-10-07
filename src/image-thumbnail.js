export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function transferFiles(transfer) {
  const files = Array.from(transfer?.files || []);
  if (files.length) return files;
  return Array.from(transfer?.items || [])
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter(Boolean);
}

export async function imageThumbnail(file, maxBytes = IMAGE_MAX_BYTES) {
  const message =
    maxBytes === IMAGE_MAX_BYTES
      ? "Выберите JPG, PNG или WebP размером до 10 МБ."
      : "Выберите JPG, PNG или WebP размером до 5 МБ.";
  const type = file.type.toLowerCase();
  if (
    (!IMAGE_TYPES.includes(type) &&
      !(type === "" && /\.(jpe?g|png|webp)$/i.test(file.name))) ||
    !file.size ||
    file.size > maxBytes
  )
    throw new Error(message);
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const jpeg = header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every(
    (byte, index) => header[index] === byte,
  );
  const webp =
    String.fromCharCode(...header.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...header.slice(8, 12)) === "WEBP";
  if (!jpeg && !png && !webp) throw new Error(message);
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 640 / bitmap.width, 640 / bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  } catch {
    throw new Error("Не удалось прочитать изображение.");
  } finally {
    bitmap?.close();
  }
}

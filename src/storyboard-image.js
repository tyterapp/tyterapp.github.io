import { imageThumbnail } from "./image-thumbnail.js";

// Reuse the signature/decode checks, but preserve the source for montage exports.
export async function storyboardImage(file) {
  await imageThumbnail(file, 5 * 1024 * 1024);
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const type =
    header[0] === 0xff
      ? "image/jpeg"
      : header[0] === 137
        ? "image/png"
        : "image/webp";
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(new Error("Не удалось прочитать изображение."));
    reader.readAsDataURL(new Blob([file], { type }));
  });
}

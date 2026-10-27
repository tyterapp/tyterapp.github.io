export function shotAspectRatio(value) {
  const match = String(value || "").match(
    /^(\d+(?:\.\d+)?)(?::(\d+(?:\.\d+)?))?\+?$/,
  );
  if (!match) return null;
  const ratio = Number(match[1]) / (match[2] ? Number(match[2]) : 1);
  return Number.isFinite(ratio) && ratio > 0 ? ratio : null;
}

// Preserve the uploaded original; only the preview and exported copy are cropped.
export async function croppedShotImage(image, aspectRatio) {
  const ratio = shotAspectRatio(aspectRatio);
  if (!image || !ratio) return image || null;
  const bitmap = await createImageBitmap(await (await fetch(image)).blob());
  try {
    const width = Math.min(bitmap.width, bitmap.height * ratio);
    const height = Math.min(bitmap.height, bitmap.width / ratio);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    const context = canvas.getContext("2d");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(
      bitmap,
      (bitmap.width - width) / 2,
      (bitmap.height - height) / 2,
      width,
      height,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    return canvas.toDataURL("image/jpeg", 0.9);
  } finally {
    bitmap.close();
  }
}

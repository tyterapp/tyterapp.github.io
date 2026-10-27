// This command exists only to prepare the initial frozen edition. It refuses to rebuild a frozen copy.
import {
  cp,
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import react from "@vitejs/plugin-react";
import { createCanvas, loadImage } from "@napi-rs/canvas";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "frozen/dildamode"),
  output = path.join(root, "public/dildamode");
try {
  await stat(path.join(source, "FROZEN.json"));
  throw new Error("Dilda Mode is frozen. Never rebuild or modify it.");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
await mkdir(output, { recursive: true });
const original = path.join(source, "model-icon.png");
const image = await loadImage(original),
  canvas = createCanvas(24, 30),
  ctx = canvas.getContext("2d");
ctx.drawImage(image, 0, 0, 24, 30);
const pixels = ctx.getImageData(0, 0, 24, 30).data,
  voxels = [];
for (let y = 0; y < 30; y++)
  for (let x = 0; x < 24; x++) {
    const i = (y * 24 + x) * 4,
      [r, g, b, a] = pixels.slice(i, i + 4);
    if (a > 130 && Math.max(r, g, b) > 50) voxels.push([x, y, r, g, b]);
  }
await writeFile(
  path.join(source, "src/dilda-voxels.json"),
  JSON.stringify(voxels),
);
// Offline synthetic /u/: voiced harmonics shaped around vowel formants, with a soft attack/release.
const rate = 22050,
  seconds = 0.58,
  count = Math.floor(rate * seconds),
  wav = Buffer.alloc(44 + count * 2);
wav.write("RIFF", 0);
wav.writeUInt32LE(wav.length - 8, 4);
wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(rate, 24);
wav.writeUInt32LE(rate * 2, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write("data", 36);
wav.writeUInt32LE(count * 2, 40);
let phase = 0;
for (let i = 0; i < count; i++) {
  const t = i / rate,
    f0 = 145 - (40 * t) / seconds;
  phase += (2 * Math.PI * f0) / rate;
  let sample = 0;
  for (let h = 1; h < 20; h++) {
    const f = h * f0;
    const amplitude =
      (0.2 +
        2.8 * Math.exp(-Math.pow((f - 340) / 100, 2)) +
        1.4 * Math.exp(-Math.pow((f - 820) / 180, 2))) /
      h;
    sample += Math.sin(phase * h) * amplitude;
  }
  const env =
    Math.min(1, t / 0.025, (seconds - t) / 0.12) *
    (0.9 + 0.1 * Math.sin(t * 12));
  wav.writeInt16LE(
    Math.round(Math.tanh(sample * 0.8) * env * 23000),
    44 + i * 2,
  );
}
await writeFile(path.join(source, "uuuu.wav"), wav);
await build({
  configFile: false,
  root: source,
  base: "/dildamode/",
  plugins: [react()],
  publicDir: false,
  build: {
    outDir: output,
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          editor: ["@tiptap/react", "@tiptap/starter-kit", "@tiptap/core"],
        },
      },
    },
  },
});
// Snapshot all current public resources once; never reference the mutable root copies at runtime.
for (const entry of await readdir(path.join(root, "public"), {
  withFileTypes: true,
})) {
  if (entry.name === "dildamode") continue;
  await cp(
    path.join(root, "public", entry.name),
    path.join(output, entry.name),
    { recursive: true },
  );
}
await cp(original, path.join(output, "model-icon.png"));
await cp(path.join(source, "uuuu.wav"), path.join(output, "uuuu.wav"));
await cp(path.join(source, "AGENTS.md"), path.join(output, "AGENTS.md"));
console.log(
  `Dilda Mode ready for final review: ${voxels.length} voxels. Freeze after verification.`,
);

import { test, expect } from "@playwright/test";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import jsQR from "jsqr";

test("GitHub's common telegram preview has no QR pointing to an empty reader", async ({
  request,
}) => {
  const html = await (await request.get("/telegram/")).text();
  expect(html).toMatch(
    /property="og:image"\s+content="https:\/\/tyterapp\.github\.io\/telegram\/cover-generic-v2\.png"/,
  );
  for (const path of [
    "/telegram/cover-generic-v2.png",
    "/telegram/cover.png",
  ]) {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    const image = await loadImage(await response.body());
    const canvas = createCanvas(1200, 630);
    canvas.getContext("2d").drawImage(image, 0, 0);
    const pixels = canvas.getContext("2d").getImageData(840, 224, 320, 320);
    expect(jsQR(pixels.data, 320, 320)).toBe(null);
  }
});

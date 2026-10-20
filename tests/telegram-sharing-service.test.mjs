import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import jsQR from "jsqr";
import { createTelegramHandler } from "../server/telegram-share.mjs";
import { paintTelegramCover } from "../src/telegram-cover.js";
import { telegramLink, readTelegram } from "../src/telegram.js";

test("personal covers contain a decodable unique QR and long offline links never draw an invalid code", async () => {
  const telegram = {
    text: "ПЯТАК, ПРИВЕТ!",
    title: "Новая история",
    language: "ru",
  };
  const link = telegramLink(
    telegram.text,
    "ru",
    "https://tyterapp.github.io",
    telegram.title,
  );
  assert.equal(readTelegram(new URL(link).hash).title, telegram.title);
  const canvas = createCanvas(1200, 630);
  assert.equal(paintTelegramCover(canvas, telegram, link).qrAvailable, true);
  const pixels = canvas.getContext("2d").getImageData(840, 224, 320, 320);
  assert.equal(jsQR(pixels.data, pixels.width, pixels.height)?.data, link);
  assert.equal(
    paintTelegramCover(
      canvas,
      telegram,
      "https://example.com/#" + "x".repeat(10000),
    ).qrAvailable,
    false,
  );
});

test("sharing service publishes only chosen text/title and serves immutable HTML metadata and PNG to crawlers without JavaScript", async () => {
  const store = await mkdtemp(path.join(os.tmpdir(), "tyter-telegram-test-"));
  const site = path.resolve("public");
  // The test HTML lives in the temporary directory; assets are provided separately.
  await mkdir(path.join(store, "site", "telegram"), { recursive: true });
  await mkdir(path.join(store, "site", "brand"), { recursive: true });
  await mkdir(path.join(store, "site", "fonts"), { recursive: true });
  const { copyFile } = await import("node:fs/promises");
  for (const file of ["brand/tyter-logo.svg", "fonts/Cousine-Regular.ttf"])
    await copyFile(path.join(site, file), path.join(store, "site", file));
  await writeFile(
    path.join(store, "site", "telegram", "index.html"),
    '<html><head><title>Old</title><meta property="og:image" content="old" /><link rel="canonical" href="old" /></head><body></body></html>',
  );
  let handler;
  const server = createServer((req, res) =>
    handler(req, res).then((handled) => {
      if (!handled) res.writeHead(404).end();
    }),
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  handler = createTelegramHandler({
    site: path.join(store, "site"),
    store: path.join(store, "data"),
    origin,
  });
  try {
    const publish = (body) =>
      fetch(origin + "/api/telegrams", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://tyterapp.github.io",
        },
        body: JSON.stringify(body),
      });
    const telegram = {
      version: 1,
      language: "ru",
      text: "МИР <script>alert(1)</script>",
      title: 'История "$&"',
      private: "PRIVATE_PROJECT",
    };
    const response = await publish(telegram);
    assert.equal(response.status, 201);
    const result = await response.json();
    assert.equal((await (await publish(telegram)).json()).url, result.url);
    const html = await (
      await fetch(result.url, { headers: { "User-Agent": "TelegramBot" } })
    ).text();
    assert.match(
      html,
      /property="og:description" content="История &quot;\$&amp;&quot;"/,
    );
    assert.match(html, /property="og:image" content="http:\/\/127.0.0.1/);
    assert.ok(!html.includes("PRIVATE_PROJECT"));
    assert.ok(!html.includes("<script>alert"));
    const png = await fetch(result.coverURL);
    assert.equal(png.headers.get("content-type"), "image/png");
    const bitmap = await loadImage(Buffer.from(await png.arrayBuffer()));
    assert.equal(bitmap.width, 1200);
    assert.equal(bitmap.height, 630);
    const canvas = createCanvas(1200, 630);
    canvas.getContext("2d").drawImage(bitmap, 0, 0);
    const pixels = canvas.getContext("2d").getImageData(840, 224, 320, 320);
    assert.equal(jsQR(pixels.data, 320, 320)?.data, result.url);
    assert.equal((await publish({ ...telegram, text: "\u0000" })).status, 400);
    assert.equal(
      (
        await fetch(origin + "/api/telegrams", {
          method: "POST",
          headers: {
            origin: "https://evil.example",
            "content-type": "application/json",
          },
          body: JSON.stringify(telegram),
        })
      ).status,
      403,
    );
    assert.equal(
      (await fetch(origin + "/telegram/?id=../../other")).status,
      404,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    assert.ok(
      path
        .resolve(store)
        .startsWith(path.join(os.tmpdir(), "tyter-telegram-test-")),
    );
    await rm(store, { recursive: true, force: true });
  }
});

import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import {
  HOUSE_SNAPSHOT_SCENES,
  houseSnapshotRoute,
  houseSnapshotLink,
  houseSnapshotScene,
  readHouseSnapshotLocation,
} from "../../src/house-snapshot.js";

test("house social covers are in the first HTML response for crawlers, with one public PNG per visual state", async ({
  request,
}) => {
  const hashes = new Set();
  for (const scene of HOUSE_SNAPSHOT_SCENES) {
    const route = houseSnapshotRoute(scene);
    for (const agent of [
      "TelegramBot",
      "facebookexternalhit/1.1",
      "Twitterbot/1.0",
      "VKShare",
    ]) {
      const response = await request.get(route, {
        headers: { "user-agent": agent },
      });
      expect(response.status()).toBe(200);
      const html = await response.text();
      const meta = (key) =>
        html.match(
          new RegExp(
            `<meta\\s+(?:property|name)="${key}"\\s+content="([^"]+)"`,
          ),
        )?.[1];
      expect(meta("og:image")).toBe(
        `https://tyterapp.github.io${route}cover.png`,
      );
      expect(meta("og:image:secure_url")).toBe(meta("og:image"));
      expect(meta("twitter:image")).toBe(meta("og:image"));
      expect(meta("twitter:card")).toBe("summary_large_image");
      expect(meta("og:image:type")).toBe("image/png");
      expect(meta("og:image:width")).toBe("1200");
      expect(meta("og:image:height")).toBe("630");
      expect(meta("og:image:alt")).toBeTruthy();
      expect(meta("og:url")).toBe(`https://tyterapp.github.io${route}`);
      expect(html).toContain(`href="https://tyterapp.github.io${route}"`);
      expect(meta("og:image")).not.toContain("blob:");
    }
    const png = await request.get(`${route}cover.png`);
    expect(png.status()).toBe(200);
    expect(png.headers()["content-type"]).toContain("image/png");
    const bytes = await png.body();
    expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([
      1200, 630,
    ]);
    expect(bytes.length).toBeLessThan(300_000);
    hashes.add(createHash("sha256").update(bytes).digest("hex"));
    const head = await request.head(`${route}cover.png`);
    expect(head.status()).toBe(200);
    expect((await head.body()).length).toBe(0);
  }
  expect(hashes.size).toBe(HOUSE_SNAPSHOT_SCENES.length);
  const legacy = await (await request.get("/house/")).text();
  expect(legacy).toMatch(
    /property="og:image"\s+content="https:\/\/tyterapp.github.io\/house\/v1\/empty\/cover.png"/,
  );
});

test("public house social routes keep the scene when a social network drops the fragment and still accept legacy links", async ({
  page,
}, info) => {
  for (const scene of HOUSE_SNAPSHOT_SCENES) {
    const snapshot = { ...scene, takenAt: 1791975600000 };
    const link = new URL(houseSnapshotLink(snapshot, info.project.use.baseURL));
    expect(readHouseSnapshotLocation(link)).toEqual(snapshot);
    await page.goto(link.href);
    const image = page.locator(".house-snapshot-card > img");
    await expect(image).toBeVisible();
    await expect(image).toHaveAttribute(
      "src",
      scene.skin ? /^blob:/ : /house-snapshot-v1\.png$/,
    );
    await page.goto(link.pathname);
    await expect(image).toBeVisible();
    await expect(image).toHaveAttribute(
      "src",
      scene.skin ? /^blob:/ : /house-snapshot-v1\.png$/,
    );
    expect(
      readHouseSnapshotLocation({ pathname: link.pathname, hash: "" }),
    ).toMatchObject(
      scene.skin ? { skin: scene.skin, frame: scene.frame } : { version: 1 },
    );
    link.pathname = "/house";
    await page.goto(link.href);
    await expect(image).toBeVisible();
    await expect(image).toHaveAttribute(
      "src",
      scene.skin ? /^blob:/ : /house-snapshot-v1\.png$/,
    );
    await expect(page.locator(".screenplay-editor")).toHaveCount(0);
  }
  await page.screenshot({ path: info.outputPath("shared-house.png") });
});

test("house social URLs reject mismatched or unknown scenes and do not expose private snapshot fields", async ({
  request,
}) => {
  expect(houseSnapshotScene("/house/v1/oiia/999/")).toBeNull();
  expect(houseSnapshotScene("/house/v2/empty/")).toBeNull();
  expect(houseSnapshotScene("/house/v1/other/0/")).toBeNull();
  const url = new URL(
    houseSnapshotLink({
      version: 1,
      takenAt: 1,
      skin: "oiia",
      frame: 0,
      document: "secret",
      coins: 123,
    }),
  );
  expect(url.href).not.toContain("secret");
  url.pathname = "/house/v1/oiia/1/";
  expect(readHouseSnapshotLocation(url)).toBeNull();
  for (const route of [
    "/house/v1/oiia/999/",
    "/house/v2/empty/",
    "/house/v1/other/0/",
  ])
    expect((await request.get(route)).status()).toBe(404);
});

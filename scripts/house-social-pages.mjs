import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import {
  HOUSE_ROOM,
  HOUSE_SNAPSHOT_SCENES,
  houseSnapshotRoute,
} from "../src/house-snapshot.js";
import { findHouseSkin, HOUSE_SKIN_PLACEMENT } from "../src/house-skins.js";
import { pageMetadata } from "./site-seo.mjs";

// Each public visual state has its own HTML and PNG, so crawlers need no JS or API.
export async function writeHouseSocialPages(output) {
  const html = await readFile(path.join(output, "index.html"), "utf8");
  const room = await loadImage(path.join(output, HOUSE_ROOM.image.slice(1)));
  for (const scene of HOUSE_SNAPSHOT_SCENES) {
    const route = houseSnapshotRoute(scene);
    const directory = path.join(output, route.slice(1));
    await mkdir(directory, { recursive: true });
    const snapshot = createCanvas(HOUSE_ROOM.width, HOUSE_ROOM.height);
    const context = snapshot.getContext("2d");
    context.drawImage(room, 0, 0);
    if (scene.skin) {
      const sprite = await loadImage(
        path.join(
          output,
          findHouseSkin(scene.skin).frames[scene.frame].slice(1),
        ),
      );
      context.drawImage(
        sprite,
        HOUSE_ROOM.width * HOUSE_SKIN_PLACEMENT.x,
        HOUSE_ROOM.height * HOUSE_SKIN_PLACEMENT.y,
        HOUSE_ROOM.width * HOUSE_SKIN_PLACEMENT.width,
        HOUSE_ROOM.height * HOUSE_SKIN_PLACEMENT.height,
      );
    }
    const cover = createCanvas(1200, 630);
    const paint = cover.getContext("2d");
    paint.fillStyle = "#f6f6f8";
    paint.fillRect(0, 0, 1200, 630);
    const height = 566,
      width = (height * HOUSE_ROOM.width) / HOUSE_ROOM.height;
    paint.drawImage(snapshot, (1200 - width) / 2, 32, width, height);
    await writeFile(
      path.join(directory, "cover.png"),
      await cover.encode("png"),
    );
    await writeFile(
      path.join(directory, "index.html"),
      pageMetadata(html, route.slice(1, -1)),
    );
  }
  console.log(
    `Обложки снимков домика: ${HOUSE_SNAPSHOT_SCENES.length} страниц и PNG 1200×630`,
  );
}

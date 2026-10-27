// Published room artwork is immutable: new artwork gets a new version and URL.
import {
  findHouseSkin,
  HOUSE_SKINS,
  HOUSE_SKIN_PLACEMENT,
} from "./house-skins.js";
export const HOUSE_ROOM = Object.freeze({
  version: 1,
  image: "/dildamode/oiia/house-snapshot-v1.png",
  width: 734,
  height: 468,
});

function validSnapshot(value) {
  return (
    value?.version === HOUSE_ROOM.version &&
    Number.isSafeInteger(value.takenAt) &&
    value.takenAt >= 0 &&
    value.takenAt <= 8640000000000000 &&
    ((value.skin == null && value.frame == null) ||
      (findHouseSkin(value.skin) &&
        Number.isInteger(value.frame) &&
        value.frame >= 0 &&
        value.frame < findHouseSkin(value.skin).frames.length))
  );
}

function snapshotDescriptor(value) {
  return validSnapshot(value)
    ? {
        version: value.version,
        takenAt: value.takenAt,
        ...(value.skin ? { skin: value.skin, frame: value.frame } : {}),
      }
    : null;
}

export const HOUSE_SNAPSHOT_SCENES = Object.freeze([
  Object.freeze({ version: HOUSE_ROOM.version, takenAt: 0 }),
  ...HOUSE_SKINS.flatMap((skin) =>
    skin.frames.map((_, frame) =>
      Object.freeze({
        version: HOUSE_ROOM.version,
        takenAt: 0,
        skin: skin.id,
        frame,
      }),
    ),
  ),
]);

export function houseSnapshotRoute(snapshot) {
  if (!validSnapshot(snapshot)) throw new Error("Invalid house snapshot");
  return `/house/v${snapshot.version}/${snapshot.skin ? `${snapshot.skin}/${snapshot.frame}` : "empty"}/`;
}

export function houseSnapshotScene(pathname) {
  if (typeof pathname !== "string") return null;
  const route = pathname.replace(/\/+$/, "") + "/";
  return (
    HOUSE_SNAPSHOT_SCENES.find(
      (scene) => houseSnapshotRoute(scene) === route,
    ) || null
  );
}

export function houseSnapshotLink(snapshot, base = globalThis.location?.href) {
  const descriptor = snapshotDescriptor(snapshot);
  if (!descriptor) throw new Error("Invalid house snapshot");
  let origin = "https://tyterapp.github.io";
  try {
    const address = new URL(base);
    if (["http:", "https:"].includes(address.protocol)) origin = address.origin;
  } catch {
    // Installed apps share the public viewer instead of a private desktop URL.
  }
  const url = new URL(houseSnapshotRoute(descriptor), origin);
  const encoded = btoa(JSON.stringify(descriptor))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  url.hash = `snapshot=${encoded}`;
  return url.href;
}

export function readHouseSnapshot(hash) {
  if (typeof hash !== "string" || hash.length > 1024) return null;
  try {
    const encoded = new URLSearchParams(hash.replace(/^#/, "")).get("snapshot");
    if (!encoded || !/^[\w-]+$/.test(encoded)) return null;
    const snapshot = JSON.parse(
      atob(encoded.replace(/-/g, "+").replace(/_/g, "/")),
    );
    return snapshotDescriptor(snapshot);
  } catch {
    return null;
  }
}

export function readHouseSnapshotLocation({ pathname, hash }) {
  const scene = houseSnapshotScene(pathname);
  if (pathname.replace(/\/+$/, "") !== "/house" && !scene) return null;
  if (!hash) return scene ? { ...scene, takenAt: Date.now() } : null;
  const snapshot = readHouseSnapshot(hash);
  return snapshot &&
    (!scene || houseSnapshotRoute(snapshot) === houseSnapshotRoute(scene))
    ? snapshot
    : null;
}

export function houseSnapshotFilename(snapshot) {
  return `oiia-house-${new Date(snapshot.takenAt).toISOString().replace(/[:.]/g, "-")}.png`;
}

export async function captureHouseSnapshot(
  image,
  takenAt = Date.now(),
  pet = null,
) {
  const snapshot = snapshotDescriptor({
    version: HOUSE_ROOM.version,
    takenAt,
    ...pet,
  });
  if (!image || !snapshot) throw new Error("House image is unavailable");
  await image.decode();
  if (!image.naturalWidth || !image.naturalHeight)
    throw new Error("House image is unavailable");
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  if (snapshot.skin) {
    const sprite = new Image();
    sprite.src = findHouseSkin(snapshot.skin).frames[snapshot.frame];
    await sprite.decode();
    context.drawImage(
      sprite,
      canvas.width * HOUSE_SKIN_PLACEMENT.x,
      canvas.height * HOUSE_SKIN_PLACEMENT.y,
      canvas.width * HOUSE_SKIN_PLACEMENT.width,
      canvas.height * HOUSE_SKIN_PLACEMENT.height,
    );
  }
  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new Error("House capture failed");
  return {
    snapshot,
    blob,
    link: houseSnapshotLink(snapshot),
    filename: houseSnapshotFilename(snapshot),
  };
}

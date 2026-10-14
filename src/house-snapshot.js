// Published room artwork is immutable: new artwork gets a new version and URL.
// The current house has one room layer; its descriptor is the complete scene.
export const HOUSE_ROOM = Object.freeze({
  version: 1,
  image: "/oiia/house-snapshot-v1.png",
  width: 734,
  height: 468,
});

function validSnapshot(value) {
  return (
    value?.version === HOUSE_ROOM.version &&
    Number.isSafeInteger(value.takenAt) &&
    value.takenAt >= 0 &&
    value.takenAt <= 8640000000000000
  );
}

export function houseSnapshotLink(snapshot, base = globalThis.location?.href) {
  if (!validSnapshot(snapshot)) throw new Error("Invalid house snapshot");
  let origin = "https://tyterapp.github.io";
  try {
    const address = new URL(base);
    if (["http:", "https:"].includes(address.protocol)) origin = address.origin;
  } catch {
    // Installed apps share the public viewer instead of a private desktop URL.
  }
  const url = new URL("/house", origin);
  const encoded = btoa(
    JSON.stringify({ version: snapshot.version, takenAt: snapshot.takenAt }),
  )
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
    return validSnapshot(snapshot)
      ? { version: snapshot.version, takenAt: snapshot.takenAt }
      : null;
  } catch {
    return null;
  }
}

export function houseSnapshotFilename(snapshot) {
  return `oiia-house-${new Date(snapshot.takenAt).toISOString().replace(/[:.]/g, "-")}.png`;
}

export async function captureHouseSnapshot(image, takenAt = Date.now()) {
  const snapshot = { version: HOUSE_ROOM.version, takenAt };
  if (!image || !validSnapshot(snapshot))
    throw new Error("House image is unavailable");
  await image.decode();
  if (!image.naturalWidth || !image.naturalHeight)
    throw new Error("House image is unavailable");
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  canvas.getContext("2d").drawImage(image, 0, 0);
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

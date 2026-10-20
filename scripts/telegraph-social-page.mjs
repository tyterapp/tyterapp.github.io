import { copyFile } from "node:fs/promises";
import path from "node:path";

// Keep the previous image URL working; the versioned URL refreshes cached previews.
export async function writeTelegraphSocialPage(output) {
  await copyFile(
    path.join(output, "telegraph", "cover-white-v1.png"),
    path.join(output, "telegraph", "cover.png"),
  );
}

import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Cache only public editor resources. Access lists and user documents never enter this cache.
export function offlineEditorPlugin() {
  let config;
  return {
    name: "tyter-offline-editor",
    apply: "build",
    configResolved(value) {
      config = value;
    },
    async closeBundle() {
      if (config.base !== "/") return;
      const output = path.resolve(config.root, config.build.outDir);
      const resources = ["/index.html"];
      async function collect(directory) {
        for (const entry of await readdir(path.join(output, directory), {
          withFileTypes: true,
        })) {
          const relative = `${directory}/${entry.name}`;
          if (entry.isDirectory()) await collect(relative);
          else if (entry.isFile()) resources.push(`/${relative}`);
        }
      }
      for (const directory of [
        "assets",
        "fonts",
        "dictionary",
        "audio",
        "brand",
        "icons",
        "oiia",
        "tikitok",
        "telegraph",
      ]) {
        try {
          await collect(directory);
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
      }
      resources.sort();
      const hash = createHash("sha256");
      for (const url of resources) {
        hash.update(url);
        hash.update(await readFile(path.join(output, url.slice(1))));
      }
      const template = await readFile(
        fileURLToPath(new URL("./offline-editor-worker.js", import.meta.url)),
        "utf8",
      );
      hash.update(template);
      await writeFile(
        path.join(output, "editor-sw.js"),
        `const CACHE = "tyter-editor-${hash.digest("hex").slice(0, 20)}";\n` +
          `const RESOURCES = ${JSON.stringify(resources)};\n${template}`,
      );
    },
  };
}

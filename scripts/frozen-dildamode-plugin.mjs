import { readFile } from "node:fs/promises";
import { verifyFrozenDildaMode } from "./verify-frozen-dildamode.mjs";

// Keep the frozen HTML outside Vite's SPA fallback. Assets are served unchanged from public/.
export function frozenDildaModePlugin() {
  let building = false;
  return {
    name: "frozen-dildamode",
    configResolved(config) {
      building = config.command === "build";
    },
    async buildStart() {
      if (building) await verifyFrozenDildaMode();
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, "http://localhost");
        if (
          !["/dildamode", "/dildamode/", "/dildamode/index.html"].includes(
            url.pathname,
          )
        )
          return next();
        try {
          const html = await readFile(
            new URL("../public/dildamode/index.html", import.meta.url),
          );
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(html);
        } catch (error) {
          next(error);
        }
      });
    },
  };
}

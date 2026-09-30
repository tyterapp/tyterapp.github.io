import { createWebProHandler } from "./server/web-pro.mjs";

export function webProPlugin() {
  return {
    name: "tyter-web-pro-api",
    configureServer(server) {
      server.middlewares.use(createWebProHandler());
    },
    configurePreviewServer(server) {
      server.middlewares.use(createWebProHandler());
    },
  };
}

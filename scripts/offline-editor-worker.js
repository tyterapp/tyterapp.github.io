/* CACHE and RESOURCES are generated from the published build. */
const PREFIX = "tyter-editor-";
const resourcePaths = new Set(RESOURCES);
const editorPaths = new Set(["/beta", "/pro", "/app", "/free"]);

async function videoRange(response, range) {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(range.trim());
  if (!match || (!match[1] && !match[2])) return response;
  const body = await response.blob(),
    size = body.size;
  const start = match[1]
    ? Number(match[1])
    : Math.max(0, size - Number(match[2]));
  const end =
    match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start > end ||
    start >= size
  )
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${size}` },
    });
  const headers = new Headers(response.headers);
  headers.delete("Content-Encoding");
  headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
  headers.set("Content-Length", String(end - start + 1));
  headers.set("Accept-Ranges", "bytes");
  return new Response(body.slice(start, end + 1), { status: 206, headers });
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Activate a release only when its HTML, chunks, fonts and other resources all exist.
      try {
        await cache.addAll(
          RESOURCES.map((url) => new Request(url, { cache: "reload" })),
        );
      } catch (error) {
        // An incomplete install must not displace an older working release during cleanup.
        if (!(await cache.match("/index.html"))) await caches.delete(CACHE);
        throw error;
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Keep assets used by an editor tab still open on the previous release.
      await self.clients.claim();
      const keys = (await caches.keys()).filter((key) =>
        key.startsWith(PREFIX),
      );
      const obsolete = keys.filter((key) => key !== CACHE).slice(0, -1);
      await Promise.all(obsolete.map((key) => caches.delete(key)));
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  if (request.mode === "navigate" && editorPaths.has(pathname)) {
    event.respondWith(
      (async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        try {
          const response = await fetch(request, { signal: controller.signal });
          if (response.ok) return response;
        } catch {
          /* The installed release remains available without a connection. */
        } finally {
          clearTimeout(timeout);
        }
        return (await caches.open(CACHE)).match("/index.html");
      })(),
    );
  } else if (
    resourcePaths.has(url.pathname) ||
    url.pathname.startsWith("/assets/")
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const response = await cache.match(request, { ignoreSearch: true });
        const previous =
          !response && url.pathname.startsWith("/assets/")
            ? await caches.match(request, { ignoreSearch: true })
            : null;
        const cached = response || previous;
        const range = request.headers.get("Range");
        // Native video seeking and looping request partial bytes, including offline.
        if (
          cached?.status === 200 &&
          range &&
          url.pathname.startsWith("/tikitok/")
        )
          return videoRange(cached, range);
        return cached || fetch(request);
      })(),
    );
  }
});

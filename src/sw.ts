/// <reference lib="webworker" />
export {};
declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: { url: string; revision: string | null }[];
};
const manifest = [
  ...new Map(self.__WB_MANIFEST.map((entry) => [entry.url, entry])).values(),
];
const version = manifest
  .map((e) => e.url + e.revision)
  .join("")
  .split("")
  .reduce((hash, ch) => (Math.imul(31, hash) + ch.charCodeAt(0)) | 0, 0);
const shellName = `foodie-shell-${version}`;
const imageName = "foodie-images-v1";
const assets = new Set(
  manifest.map((e) => new URL(e.url, self.location.origin).href),
);
self.addEventListener("install", (event) =>
  event.waitUntil(
    caches
      .open(shellName)
      .then((cache) =>
        cache.addAll(
          manifest.map((e) => new Request(e.url, { cache: "reload" })),
        ),
      ),
  ),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys())
        if (name.startsWith("foodie-shell-") && name !== shellName)
          await caches.delete(name);
      await self.clients.claim();
    })(),
  ),
);
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") void self.skipWaiting();
});
self.addEventListener("fetch", (event) => {
  const req = event.request,
    url = new URL(req.url);
  if (
    req.method !== "GET" ||
    (url.origin === self.location.origin && url.pathname.startsWith("/api/"))
  )
    return;
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(async () => {
        const cached = await (
          await caches.open(shellName)
        ).match("/index.html");
        return cached || Response.error();
      }),
    );
    return;
  }
  if (assets.has(url.href)) {
    event.respondWith(
      caches
        .open(shellName)
        .then(async (cache) => (await cache.match(req)) || fetch(req)),
    );
    return;
  }
  if (req.destination === "image") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(imageName),
          cached = await cache.match(req);
        if (cached) return cached;
        const response = await fetch(req);
        if (response.ok || response.type === "opaque") {
          await cache.put(req, response.clone());
          const keys = await cache.keys();
          if (keys.length > 100) await cache.delete(keys[0]);
        }
        return response;
      })(),
    );
  }
});

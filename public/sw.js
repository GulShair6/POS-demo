const CACHE = "atlas-pos-static-v3";
const STATIC = ["/manifest.webmanifest", "/favicon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(STATIC))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  const cacheable =
    request.method === "GET" &&
    url.origin === self.location.origin &&
    ["script", "style", "image", "font"].includes(request.destination);
  if (!cacheable) return;
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        // Clone immediately — deferring clone until after caches.open() can throw
        // "Response body is already used" once the browser consumes the body.
        if (response.ok) {
          const copy = response.clone();
          caches
            .open(CACHE)
            .then((cache) => cache.put(request, copy))
            .catch(() => undefined);
        }
        return response;
      });
    })
  );
});

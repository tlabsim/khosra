// Only static app assets are cached. API and manuscript responses are never cached.
const CACHE = "khosra-shell-f0a4384c6a0c";
self.addEventListener("install", (event) =>
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const response = await fetch("/index.html", { cache: "reload" });
      if (!response.ok) throw Error("Shell unavailable");
      const html = await response.clone().text();
      const assets = [
        ...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g),
      ].map((m) => m[1]);
      await cache.put("/index.html", response);
      await cache.addAll([
        "/",
        "/manifest.webmanifest",
        "/favicon.svg?v=3",
        "/fonts/NotoSerifBengali.ttf",
        "/fonts/NotoSansBengali.ttf",
        ...assets,
      ]);
    })(),
  ),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
        ),
      ),
  ),
);
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== location.origin ||
    url.pathname.startsWith("/api")
  )
    return;
  if (!(
    url.pathname === "/" ||
    url.pathname === "/index.html" ||
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/fonts/") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/favicon.svg"
  ))
    return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(
            caches.open(CACHE).then((c) => c.put(event.request, copy)),
          );
        }
        return response;
      })
      .catch(() =>
        caches
          .match(event.request)
          .then((r) => r || caches.match("/index.html")),
      ),
  );
});

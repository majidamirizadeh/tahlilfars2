/* Service Worker - cache static assets only, never sensitive API responses */
const CACHE = "tahlilfars-static-v2";
const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/tokens.css",
  "./css/base.css",
  "./css/layout.css",
  "./css/components.css",
  "./css/views.css",
  "./css/trend.css",
  "./css/print.css",
  "./js/app.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // Never cache API / script.google.com or sensitive responses
  if (url.hostname.includes("script.google.com") || url.pathname.includes("/macros/")) {
    return; // network only
  }
  // Static assets: cache-first
  if (e.request.method === "GET" && (url.origin === self.location.origin)) {
    e.respondWith(
      caches.match(e.request).then((cached) => cached || fetch(e.request).then((res) => {
        if (res.ok && e.request.url.match(/\.(css|js|png|woff2|webmanifest)$/)) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
        }
        return res;
      }))
    );
  }
});

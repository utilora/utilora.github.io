const CACHE = "utilora-v9";
const PRECACHE = [
  "./",
  "./index.html",
  "./favicon.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./site.webmanifest",
  "./assets/css/site.css",
  "./assets/css/finance-home.css",
  "./assets/js/app.js",
  "./assets/js/analytics.js",
  "./assets/js/finance.js",
  "./assets/js/csv.js",
  "./assets/js/xlsx-lite.js",
  "./pro/",
  "./pro/pro.css",
  "./pro/app.js",
  "./tools/vat-split/",
  "./tools/payroll/",
  "./policies/",
  "./feedback/",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).then((response) => {
    if (response && response.ok) {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(event.request, copy));
    }
    return response;
  }).catch(() => caches.match(event.request).then((cached) => cached || caches.match("./"))));
});

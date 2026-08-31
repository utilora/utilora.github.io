const CACHE = "utilora-v21";
const PRECACHE = [
  "./",
  "./index.html",
  "./favicon.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./Utilora.url",
  "./site.webmanifest",
  "./assets/css/site.css",
  "./assets/css/finance-home.css",
  "./assets/js/app.js",
  "./assets/js/analytics.js",
  "./assets/js/finance.js",
  "./assets/js/csv.js",
  "./assets/js/xlsx-lite.js",
  "./assets/js/frame-guard.js",
  "./pro/",
  "./pro/pro.css",
  "./pro/app.js",
  "./tools/vat-split/",
  "./tools/payroll/",
  "./policies/",
  "./feedback/"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())
  );
});

const withFrameGuard = (response) => {
  if (!response) return response;
  const headers = new Headers(response.headers);
  headers.set("X-Frame-Options", "DENY");
  headers.set("Content-Security-Policy", "frame-ancestors 'none'");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
};

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  const isNavigate = event.request.mode === "navigate";
  const request = isNavigate
    ? new Request(event.request, { cache: "reload" })
    : event.request;
  event.respondWith(
    fetch(request).then((response) => {
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
      }
      return isNavigate ? withFrameGuard(response) : response;
    }).catch(() => caches.match(event.request).then((cached) => {
      if (cached) return isNavigate ? withFrameGuard(cached) : cached;
      return caches.match("./").then((home) => (isNavigate ? withFrameGuard(home) : home));
    }))
  );
});

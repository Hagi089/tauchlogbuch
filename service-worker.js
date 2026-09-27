/*
 * service-worker.js — cached das App-Shell für Offline-Nutzung.
 * Die eigentlichen Tauchgangsdaten liegen in IndexedDB (siehe js/db.js)
 * und sind davon unabhängig immer offline verfügbar.
 */

const CACHE_NAME = "tauchlogbuch-cache-v1";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/styles.css",
  "./js/db.js",
  "./js/dashboard.js",
  "./js/app.js",
  "./data/seed-data.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Cache-first für App-Shell-Dateien, Netzwerk-Fallback für alles andere.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).catch(() => cached);
    })
  );
});

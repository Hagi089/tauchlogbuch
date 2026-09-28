/*
 * service-worker.js — cached das App-Shell für Offline-Nutzung.
 * Die eigentlichen Tauchgangsdaten liegen in IndexedDB (siehe js/db.js)
 * und sind davon unabhängig immer offline verfügbar.
 *
 * Strategie:
 * - App-Shell (HTML/CSS/JS): NETWORK-FIRST. Beim Laden wird zuerst das
 *   Netzwerk versucht, damit du nach einem Update immer die neueste
 *   Version bekommst, sobald Internet da ist. Nur wenn das Netzwerk
 *   nicht erreichbar ist, greift der zuletzt zwischengespeicherte Stand
 *   (Offline-Fallback). Ein Vergessen, CACHE_NAME zu erhöhen, führt
 *   dadurch nicht mehr dazu, dass alte Dateien "kleben bleiben".
 * - Sonstige Assets (Icons, Manifest, Seed-Daten): CACHE-FIRST, da sie
 *   sich praktisch nie ändern und so auch offline sofort verfügbar sind.
 */

const CACHE_NAME = "tauchlogbuch-cache-v5";

// Relative Pfade, damit die App auch unter einem Unterpfad funktioniert
// (z. B. https://<user>.github.io/tauchlogbuch/).
const APP_SHELL = [
  "./index.html",
  "./css/styles.css",
  "./js/validation.js",
  "./js/db.js",
  "./js/dashboard.js",
  "./js/app.js",
];
const APP_SHELL_PATHS = APP_SHELL.map((p) => new URL(p, self.location).pathname);
const SCOPE_ROOT_PATH = new URL("./", self.location).pathname;

const STATIC_ASSETS = [
  "./",
  "./manifest.webmanifest",
  "./data/seed-data.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll([...APP_SHELL, ...STATIC_ASSETS]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function isAppShellRequest(pathname) {
  return APP_SHELL_PATHS.includes(pathname) || pathname === SCOPE_ROOT_PATH;
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);

  // Fremde Requests (z. B. die SheetJS-CDN-Datei) unangetastet lassen —
  // wir wollen hier nicht cachen oder eingreifen, nur die eigene App-Shell.
  if (url.origin !== self.location.origin) return;

  if (isAppShellRequest(url.pathname)) {
    // Network-first mit Cache-Fallback
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() =>
          caches.match(event.request).then((cached) => cached || caches.match("./index.html"))
        )
    );
  } else {
    // Cache-first für statische Assets
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request).catch(() => cached))
    );
  }
});

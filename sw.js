// Garde l'appli disponible hors ligne. La version est remplacée à chaque construction du site.
const CACHE = "mon-agenda-20261029224956";
const FICHIERS = [
  "./", "index.html", "style.css", "app.js", "web.js", "manifest.webmanifest",
  "icone-180.png", "icone-192.png", "icone-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FICHIERS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((cles) => Promise.all(cles.filter((c) => c !== CACHE).map((c) => caches.delete(c))))
      .then(() => self.clients.claim()),
  );
});

// Répond tout de suite depuis le cache, et met à jour en arrière-plan.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const enCache = await cache.match(e.request, { ignoreSearch: true });
      const reseau = fetch(e.request)
        .then((r) => { if (r.ok) cache.put(e.request, r.clone()); return r; })
        .catch(() => enCache);
      return enCache || reseau;
    }),
  );
});

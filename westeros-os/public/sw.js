/* Sufra OS service worker: app shell offline, static assets cache-first. Data lives in IndexedDB / Supabase. */
const VERSION = "sufra-os-v1";
const SHELL = "/app/index.html";
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll([SHELL, "/app/manifest.webmanifest", "/app/icons/icon-192.png"])).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("message", (e) => { if (e.data === "skip-waiting") self.skipWaiting(); });
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || !url.pathname.startsWith("/app/")) return;
  // Pages: network first so updates show immediately; offline → cached shell.
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(SHELL, copy)); return res; }).catch(() => caches.match(SHELL)));
    return;
  }
  // Hashed assets, icons, images: cache first.
  if (/\/app\/(assets|icons|img)\//.test(url.pathname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)).then(trim); } return res; })));
  }
});
// Every update of the app brings new file names; without a limit the old ones piled up on the device forever.
// Keep the newest files only (the cache lists entries oldest first).
const MAX_FILES = 600; // a little over one whole build (about 420 files)
let trimming = false;
function trim() {
  if (trimming) return;
  trimming = true;
  caches.open(VERSION).then((c) => c.keys().then((keys) => {
    const files = keys.filter((k) => /\/app\/(assets|icons|img)\//.test(new URL(k.url).pathname));
    return Promise.all(files.slice(0, Math.max(0, files.length - MAX_FILES)).map((k) => c.delete(k)));
  })).finally(() => { trimming = false; });
}
self.addEventListener("activate", () => trim());
// اللاسلكي (2026-11-25): a tap on a radio notification opens the radio screen of the app
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || self.registration.scope;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) if (c.url.startsWith(self.registration.scope) && "focus" in c) return c.navigate(url).then((w) => (w || c).focus()).catch(() => c.focus());
      return self.clients.openWindow(url);
    }),
  );
});

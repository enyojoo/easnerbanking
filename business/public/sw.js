/* Minimal Easner business SW: updateability only (no fetch interception).
   Passthrough respondWith(fetch()) previously turned network failures into
   uncaught promise rejections on public pages (e.g. customer invoices). */
self.addEventListener("install", (event) => {
  self.skipWaiting()
  event.waitUntil(Promise.resolve())
})

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim())
})

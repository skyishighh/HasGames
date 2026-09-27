// Service worker: always check for the newest version of the game's own files.
// GitHub Pages lets browsers reuse saved copies for up to 10 minutes, so after an update a normal
// refresh could still run old scripts. This asks the server every time instead ("no-cache": a quick
// "not modified" check when nothing changed, the new file when something did).
// Files from other sites (Phaser, PeerJS on the CDN) are left alone.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  // A page navigation can't be re-created with options, so fetch it by URL instead.
  event.respondWith(req.mode === 'navigate'
    ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
    : fetch(req, { cache: 'no-cache' }));
});

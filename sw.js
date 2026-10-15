// Service worker: offline use and clean updates. See docs/ARCHITECTURE.md, "Offline".
//
// Network first: every same-origin file is fetched from the server (revalidated, so a new release
// is used straight away instead of after GitHub Pages' 10-minute cache, and old and new modules
// never mix), and the copy is kept. Without a connection the kept copy is used, so a list opens
// on bad café Wi-Fi. The app shell is kept on install, so screens never opened yet work offline too.
// Other origins (the OpenStreetMap lookup) are never touched.

const CACHE = 'jk-v1';

// Everything the app needs to start and show any screen. tests/sw.test.mjs checks this list
// against the files in the repo, so a new module can't be forgotten here.
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/tokens.css',
  'css/app.css',
  'js/autofill.js',
  'js/codec.js',
  'js/components.js',
  'js/config.js',
  'js/data.js',
  'js/geo.js',
  'js/i18n.js',
  'js/icons.js',
  'js/links.js',
  'js/main.js',
  'js/routes.js',
  'js/store.js',
  'js/ui.js',
  'js/views/compare.js',
  'js/views/editor.js',
  'js/views/friend.js',
  'js/views/lists-sheet.js',
  'js/views/place-form.js',
  'js/views/random.js',
  'js/views/share.js',
  'js/views/welcome.js',
  'assets/fonts/fredoka-latin-500-normal.woff2',
  'assets/fonts/fredoka-latin-600-normal.woff2',
  'assets/fonts/plus-jakarta-sans-latin-400-normal.woff2',
  'assets/fonts/plus-jakarta-sans-latin-500-normal.woff2',
  'assets/fonts/plus-jakarta-sans-latin-600-normal.woff2',
  'assets/fonts/plus-jakarta-sans-latin-700-normal.woff2',
  'assets/icons/logo.svg',
  'assets/icons/favicon-32.png',
  'assets/icons/apple-touch-icon.png',
  'assets/icons/icon-192.png',
  'assets/og-image.png',
];

self.addEventListener('install', (event) => {
  // A file that fails to download doesn't stop the install: it's kept the first time it's used.
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => Promise.allSettled(SHELL.map((path) => cache.add(new Request(path, { cache: 'reload' })))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(networkFirst(request));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    // A page load keeps the browser's own redirect handling; files are revalidated with the server.
    const fresh = await (request.mode === 'navigate' ? fetch(request) : fetch(request, { cache: 'no-cache' }));
    if (fresh.ok && !fresh.redirected && fresh.type === 'basic') cache.put(request, fresh.clone());
    return fresh;
  } catch {
    // Offline: the kept copy. A page load with a query string (?fbclid=…) still finds the app.
    const cached = await cache.match(request, { ignoreSearch: request.mode === 'navigate' });
    return cached ?? (request.mode === 'navigate' ? (await cache.match('./')) ?? Response.error() : Response.error());
  }
}

import { readdirSync } from 'node:fs';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * Emits sw.js with every built file precached, so the app works offline
 * after the first visit. The cache name changes whenever the build does.
 */
function serviceWorker(): Plugin {
  return {
    name: 'precache-sw',
    apply: 'build',
    generateBundle(_, bundle) {
      const publicFiles = readdirSync('public');
      const files = ['./', ...[...Object.keys(bundle), ...publicFiles].map((f) => `./${f}`)];
      let hash = 0;
      for (const ch of JSON.stringify(Object.values(bundle).map((c) => ('code' in c ? c.code : c.source))))
        hash = (hash * 31 + ch.charCodeAt(0)) | 0;
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: `const CACHE = 'phl-${(hash >>> 0).toString(36)}';
const PRECACHE = ${JSON.stringify(files)};

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Cache first: at a casino the network is often bad. New builds arrive via a new sw.js.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const key = req.mode === 'navigate' ? './' : req;
  e.respondWith(
    caches.match(key, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })),
  );
});
`,
      });
    },
  };
}

export default defineConfig({
  // relative paths so the build works from any sub-path (e.g. GitHub Pages /repo/)
  base: './',
  plugins: [serviceWorker()],
  test: {
    include: ['tests/**/*.test.ts'],
  },
});

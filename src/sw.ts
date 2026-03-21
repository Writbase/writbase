/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { ExpirationPlugin } from 'workbox-expiration';
import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';

// Precache manifest (populated by build tooling if needed)
// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
precacheAndRoute(self.__WB_MANIFEST || []);

// Activate immediately, claim all clients
self.addEventListener('install', () => void self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// ── Tier 1: Static assets (StaleWhileRevalidate) ──
registerRoute(
  ({ request }) =>
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'font',
  new StaleWhileRevalidate({ cacheName: 'static-assets' }),
);

// ── Tier 1b: Images (CacheFirst) ──
registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({
    cacheName: 'images',
    plugins: [new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 7 * 24 * 60 * 60 })],
  }),
);

// ── Tier 2: Page navigation (NetworkFirst) ──
registerRoute(
  ({ request }) => request.mode === 'navigate',
  new NetworkFirst({
    cacheName: 'pages',
    networkTimeoutSeconds: 10,
    plugins: [new ExpirationPlugin({ maxEntries: 20 })],
  }),
);

// ── Tier 3: API data (NetworkFirst with cache fallback) ──
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/') && !url.pathname.includes('/health'),
  new NetworkFirst({
    cacheName: 'api-data',
    networkTimeoutSeconds: 10,
    plugins: [new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 60 * 60 })],
  }),
);

// ── Skip: Supabase auth endpoints (NetworkOnly by default, no route = no cache) ──
// ── Skip: POST/PATCH mutations (only GET is cached by Workbox by default) ──

/// <reference lib="webworker" />
/**
 * D98: the service worker (`injectManifest`). Ports the former `generateSW` rules 1:1
 * (precache, SPA navigation fallback + denylist, Cloudinary image cache, prompt-mode updates)
 * and adds the Android share target: `POST /share` → IndexedDB → 303 `/share?pending=<id>`.
 */
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { ExpirationPlugin } from 'workbox-expiration';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { savePending } from './share/share-store';
import { handleShareTarget, isShareTargetPost } from './share/share-target';

declare const self: ServiceWorkerGlobalScope;

const THIRTY_DAYS = 60 * 60 * 24 * 30;

// Registered before Workbox's router so the share POST never reaches it.
self.addEventListener('fetch', (event) => {
  if (!isShareTargetPost(event.request, self.location.origin)) return;
  event.respondWith(
    handleShareTarget(event.request, {
      origin: self.location.origin,
      save: (payload) => savePending(payload),
      newId: () => crypto.randomUUID(),
      now: () => Date.now(),
    }),
  );
});

// Prompt mode (P3.4): `updateServiceWorker(true)` posts SKIP_WAITING to the waiting worker.
self.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | null)?.type === 'SKIP_WAITING') void self.skipWaiting();
});

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: [/^\/api\//, /^\/s\//, /^\/version\.json$/],
  }),
);

registerRoute(
  /^https:\/\/res\.cloudinary\.com\//,
  new CacheFirst({
    cacheName: 'cloudinary-images',
    plugins: [
      new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: THIRTY_DAYS }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
);

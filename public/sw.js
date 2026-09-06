/**
 * The smallest service worker that does one honest job.
 *
 * ## What it does, and everything it does not
 *
 * It caches ONE document — `/offline` — and serves it when a **navigation**
 * fails. That is the whole of it. It does not cache pages, JavaScript, CSS,
 * images, fonts or API responses, and it never answers a request from the cache
 * while the network is available.
 *
 * That restraint is the point rather than laziness. A service worker that
 * caches application chunks can serve a build older than the one deployed, and
 * in a payroll product an old chunk is an old tax table: `TAX_SCHEDULES` is
 * versioned by date precisely because the wrong bands cost real money. A stale
 * salary figure rendered confidently is the failure class this whole codebase
 * is arranged to refuse, and a cache is the easiest way to introduce it.
 *
 * So: no offline data, deliberately. A company's people and pay live on a
 * server and the honest thing to show without a connection is that there is no
 * connection — which is what `/offline` says.
 *
 * ## `skipWaiting` and `clients.claim`, both, immediately
 *
 * The nightmare with a service worker is a stuck old one that nobody can get
 * rid of. Taking control at once means a deploy that changes this file wins on
 * the next load rather than waiting for every tab to close. Since it caches
 * nothing versioned, there is no consistency argument for waiting.
 *
 * ## Turning it off
 *
 * Replace the body of this file with `self.registration.unregister()` inside an
 * `activate` handler and deploy. Every client that fetches the new file will
 * remove it. That path exists because a worker you cannot withdraw is a worker
 * you should not ship.
 */

/* Bumping this drops the old cache on activate. Only ever holds `/offline`. */
const CACHE = "approvehr-offline-v1";
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      /* `reload` so an install never picks the offline page up out of the HTTP
         cache — the one document this worker owns has to be the current one. */
      await cache.add(new Request(OFFLINE_URL, { cache: "reload" }));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  /* Navigations only. A failed image or a failed API call is the page's own
     problem and it already has an answer for it — `load-failure.tsx` writes a
     sentence about what to do, and replacing that with a cached document would
     throw away the better message. */
  if (request.mode !== "navigate") return;

  event.respondWith(
    (async () => {
      try {
        /* Network first, always. `preloadResponse` is used when the browser
           offers it, which removes the worker's own start-up cost from every
           navigation. */
        const preloaded = await event.preloadResponse;
        if (preloaded) return preloaded;
        return await fetch(request);
      } catch {
        /* Only reached when the network genuinely refused. A 500 from the
           server is a Response, not a throw, and is passed through untouched:
           the app's own error boundary says more about it than this can. */
        const cache = await caches.open(CACHE);
        const offline = await cache.match(OFFLINE_URL);
        return (
          offline ??
          new Response("No connection.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          })
        );
      }
    })(),
  );
});

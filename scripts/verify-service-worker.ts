import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";

/**
 * What `public/sw.js` actually does, without a browser.
 *
 * ## Why this gate exists
 *
 * A service worker is the one thing this app installs on somebody's device that
 * **outlives the page**. A bad one is not a bad render you can reload past: it
 * persists, it answers navigations, and getting rid of it needs a deploy. So
 * the cost of it being wrong is much higher than the cost of most things here,
 * and it was the one piece of this app that could not be exercised at all —
 * neither the embedded preview browser nor a plain `next start` in this
 * environment permits `serviceWorker.register`.
 *
 * The registration itself still cannot be tested here. Everything the worker
 * *decides* can be, because it is plain JavaScript against a well-known global
 * shape — so it is run inside a `vm` context with a fake
 * `ServiceWorkerGlobalScope` and its branches are asserted directly.
 *
 * ## The two assertions that matter most
 *
 * - **A non-navigation request is never intercepted**, even with the network
 *   down. If that ever changes, this worker starts answering API calls, and a
 *   cached payroll figure served as current is the failure this whole codebase
 *   is arranged to refuse.
 * - **A 500 is passed through.** A server error is a `Response`, not a thrown
 *   fetch, and turning it into "no connection" would tell somebody to check
 *   their Wi-Fi about a problem on our side.
 */

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OFFLINE_BODY = "<!doctype html>OFFLINE DOC";

type Listener = (event: Record<string, unknown>) => void;

function makeScope(fetchImpl: () => Promise<unknown>) {
  const listeners: Record<string, Listener> = {};
  const state = {
    cache: new Map<string, string>(),
    deleted: [] as string[],
    claimed: false,
    skipped: false,
  };
  const scope: Record<string, unknown> = {
    addEventListener: (type: string, fn: Listener) => {
      listeners[type] = fn;
    },
    skipWaiting: async () => {
      state.skipped = true;
    },
    clients: {
      claim: async () => {
        state.claimed = true;
      },
    },
    caches: {
      open: async () => ({
        add: async (req: { url?: string } | string) => {
          state.cache.set(
            typeof req === "string" ? req : (req.url ?? ""),
            OFFLINE_BODY,
          );
        },
        match: async (url: string) =>
          state.cache.has(url)
            ? { body: state.cache.get(url), from: "cache" }
            : undefined,
      }),
      keys: async () => ["approvehr-offline-v1", "stale-old-cache"],
      delete: async (name: string) => {
        state.deleted.push(name);
        return true;
      },
    },
    fetch: fetchImpl,
    Request: class {
      url: string;
      constructor(url: string) {
        this.url = url;
      }
    },
    Response: class {
      body: string;
      status: number;
      from = "constructed";
      constructor(body: string, init?: { status?: number }) {
        this.body = body;
        this.status = init?.status ?? 200;
      }
    },
    Promise,
    console,
    URL,
  };
  scope["self"] = scope;
  return { scope, listeners, state };
}

async function fire(
  listeners: Record<string, Listener>,
  type: string,
  event: Record<string, unknown>,
): Promise<{ from?: string; body?: string; status?: number } | null> {
  const waits: Promise<unknown>[] = [];
  let responded: Promise<unknown> | null = null;
  const listener = listeners[type];
  if (!listener) throw new Error(`sw.js registered no "${type}" listener`);
  listener({
    ...event,
    waitUntil: (p: Promise<unknown>) => waits.push(p),
    respondWith: (p: Promise<unknown>) => {
      responded = p;
    },
  });
  await Promise.all(waits);
  if (responded === null) return null;
  return (await responded) as { from?: string; body?: string; status?: number };
}

function load(fetchImpl: () => Promise<unknown>) {
  const made = makeScope(fetchImpl);
  vm.createContext(made.scope);
  vm.runInContext(
    readFileSync(path.join(ROOT, "public/sw.js"), "utf8"),
    made.scope,
  );
  return made;
}

/* Wrapped in `main()` because tsx compiles this package to CJS, where a
   top-level await is a transform error. */
async function main(): Promise<void> {
  const results: [string, boolean][] = [];
  const check = (name: string, ok: boolean) => results.push([name, ok]);

  const working = async () => ({ body: "LIVE PAGE", from: "network" });
  const down = async (): Promise<never> => {
    throw new Error("network down");
  };

  /* install and activate */
  {
    const { listeners, state } = load(working);
    await fire(listeners, "install", {});
    check(
      "install precaches exactly one document, and it is the offline page",
      state.cache.size === 1 && state.cache.has("/offline"),
    );
    check("install calls skipWaiting", state.skipped);
    await fire(listeners, "activate", {});
    check(
      "activate drops every cache but the current one",
      state.deleted.includes("stale-old-cache") &&
        !state.deleted.includes("approvehr-offline-v1"),
    );
    check(
      "activate claims clients, so an update takes effect at once",
      state.claimed,
    );
  }

  /* the scope of interception */
  {
    const { listeners } = load(down);
    check(
      "an API request is passed straight through, even with the network down",
      (await fire(listeners, "fetch", {
        request: { mode: "cors", url: "/api/v1/employees" },
      })) === null,
    );
    check(
      "an image is passed straight through",
      (await fire(listeners, "fetch", {
        request: { mode: "no-cors", url: "/brand/icon-192.png" },
      })) === null,
    );
  }

  /* navigations */
  {
    const { listeners } = load(working);
    /* Install FIRST, so the offline document is in the cache while the network
       is also working. Without that the cache is empty here and a cache-first
       worker would pass this assertion by falling through — which is exactly
       what happened: the first version of this gate was tamper-tested with a
       cache-first rewrite and reported 10/10. A model that omits a case cannot
       catch a failure on it, and this is the case that matters most: serving a
       stale document while the network is fine is the whole reason this worker
       caches nothing but `/offline`. */
    await fire(listeners, "install", {});
    const out = await fire(listeners, "fetch", {
      request: { mode: "navigate", url: "/dashboard" },
      preloadResponse: Promise.resolve(undefined),
    });
    check(
      "a navigation is served from the NETWORK when it works, even with the offline page cached",
      out?.from === "network",
    );
  }
  {
    const { listeners } = load(async () => ({
      body: "server error",
      status: 500,
      from: "network",
    }));
    const out = await fire(listeners, "fetch", {
      request: { mode: "navigate", url: "/dashboard" },
      preloadResponse: Promise.resolve(undefined),
    });
    check(
      "a 500 is passed through, never replaced by the offline page",
      out?.status === 500 && out?.from === "network",
    );
  }
  {
    const { listeners } = load(down);
    await fire(listeners, "install", {});
    const out = await fire(listeners, "fetch", {
      request: { mode: "navigate", url: "/payroll" },
      preloadResponse: Promise.resolve(undefined),
    });
    check(
      "a failed navigation is answered with the cached offline page",
      out?.from === "cache" && out?.body === OFFLINE_BODY,
    );
  }
  {
    const { listeners } = load(async () => ({
      body: "SHOULD NOT BE CALLED",
      from: "network",
    }));
    const out = await fire(listeners, "fetch", {
      request: { mode: "navigate", url: "/people" },
      preloadResponse: Promise.resolve({ body: "PRELOADED", from: "preload" }),
    });
    check(
      "navigation preload is preferred over a second fetch",
      out?.from === "preload",
    );
  }

  let failed = 0;
  for (const [name, ok] of results) {
    if (!ok) failed += 1;
    console.log(`${ok ? "  ok  " : "FAIL  "}${name}`);
  }
  console.log(
    `\nService worker check: ${String(results.length - failed)}/${String(results.length)} behaviours hold.`,
  );
  if (failed > 0) process.exit(1);
}

void main();

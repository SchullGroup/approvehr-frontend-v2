"use client";

import { useEffect } from "react";

/**
 * Registers `public/sw.js`, and only where it belongs.
 *
 * ## Not in development, deliberately
 *
 * A service worker in front of `next dev` intercepts navigations while
 * Turbopack is rebuilding them, and the failures it then serves look like
 * application bugs. Worse, it survives after you stop the dev server, so the
 * next person on `localhost:3000` gets an offline page for a project that is
 * simply not running. `NODE_ENV` is the gate.
 *
 * The block also **unregisters** any worker it finds in development, which is
 * the half that matters: somebody who ran a production build locally once has a
 * worker registered against `localhost` for good, and it will keep answering
 * for every other project on port 3000 until something removes it.
 *
 * ## Rendered once, in the app layout, not the root
 *
 * The marketing site is served from the same Next app and has no business
 * registering a worker: nobody installs a sales page, and the offline document
 * it would cache talks about payroll. Mount this inside `(app)`.
 *
 * ## It never blocks or reports
 *
 * A failed registration is not something a reader can act on and not something
 * that stops the app working — the app is a normal website without it. So this
 * swallows the error rather than surfacing a message about a capability the
 * person never asked for.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker
        .getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .catch(() => {
          /* Nothing to do and nothing to say. */
        });
      return;
    }

    /* After `load`, so registering never competes with the first paint on a
       phone that is already working hard. */
    const register = () => {
      void navigator.serviceWorker.register("/sw.js").catch(() => {
        /* Registration is a nicety. The app is a normal website without it. */
      });
    };

    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}

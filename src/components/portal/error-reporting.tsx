"use client";

import { useEffect } from "react";
import { startErrorReporting } from "@/lib/error-reporting";

/**
 * Starts error reporting for the signed-in app.
 *
 * Mounted beside `ServiceWorker` in `(app)/layout.tsx`, and in the app rather
 * than the root for the same reason: a crash on the marketing site is a
 * different problem with a different reader, and the standalone marketing
 * export must not carry a reporter pointed at a customer's collector.
 *
 * The effect returns its own teardown, so React running it twice in development
 * leaves exactly one pair of listeners rather than two.
 */
export function ErrorReporting() {
  useEffect(() => startErrorReporting(), []);
  return null;
}

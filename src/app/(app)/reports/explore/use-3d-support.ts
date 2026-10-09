"use client";

import { useSyncExternalStore } from "react";

/**
 * `useSyncExternalStore`, not `useEffect` + `useState` — matching
 * `hooks/use-is-client.ts`'s own reasoning: a `setState` call as the first
 * thing an effect does causes a cascading render for nothing, and this
 * repo's lint config refuses it (`react-hooks/set-state-in-effect`). Both
 * values below are genuinely external-system reads — a canvas probe, a
 * media query — which is exactly the case that hook exists to cover.
 */

let webglProbe: boolean | null = null;

function probeWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return (canvas.getContext("webgl2") ?? canvas.getContext("webgl")) !== null;
  } catch {
    return false;
  }
}

/** Memoised after the first read — the answer cannot change within a tab. */
function getWebGLSnapshot(): boolean | null {
  webglProbe ??= probeWebGL();
  return webglProbe;
}

const getWebGLServerSnapshot = (): boolean | null => null;
const subscribeToNothing = () => () => {};

/**
 * `null` until the client has actually checked — never assumed. The scene is
 * mounted only once this is `true`, so a browser with WebGL switched off
 * never reaches `@react-three/fiber` at all; it sees the fallback empty
 * state instead, with the same data still readable in the table beside it.
 */
export function useWebGLSupport(): boolean | null {
  return useSyncExternalStore(
    subscribeToNothing,
    getWebGLSnapshot,
    getWebGLServerSnapshot,
  );
}

const getReducedMotionServerSnapshot = (): boolean => false;

function getReducedMotionSnapshot(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function subscribeToReducedMotion(onChange: () => void): () => void {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * Defaults to `false` (motion allowed) on the server and on first paint,
 * matching every other reduced-motion check in this codebase — there is
 * nothing to disable before the client has looked.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeToReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot,
  );
}

"use client";

import { RotateCw, WifiOff } from "lucide-react";
import { HERO_BLUE, HeroBackdrop } from "./hero-backdrop";

/**
 * A crossed-out Wi-Fi symbol in a faint white disc with a white ring, for the blue. A drawn symbol and never a
 * person: a failure gets no figure (`docs/illustrations.md` in the mobile app, HANDOVER.md here).
 */
export function ConnectionGlyph({ size = 56 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-full text-white"
      style={{
        width: size,
        height: size,
        backgroundColor: "rgba(255,255,255,0.16)",
        border: "1px solid rgba(255,255,255,0.5)",
      }}
    >
      <WifiOff
        style={{ width: size * 0.44, height: size * 0.44 }}
        strokeWidth={1.75}
      />
    </span>
  );
}

/**
 * "No connection", drawn in place of the red failure box wherever a read failed because the request never got an
 * answer. Calm on purpose: nothing is wrong with the company's data or with the app, and a red box would say it
 * is. The words are the app's own (`load-state.tsx` writes them); this only draws them.
 */
export function NoConnectionCard({
  title = "No connection",
  children,
  onRetry,
}: {
  title?: string;
  children?: React.ReactNode;
  onRetry?: (() => void) | undefined;
}) {
  return (
    <div
      role="alert"
      className="relative overflow-hidden rounded-xl text-white"
      style={{ backgroundColor: HERO_BLUE.from }}
    >
      <HeroBackdrop />
      <div className="relative flex flex-col items-center gap-3 px-6 py-8 text-center">
        <ConnectionGlyph />
        {/* Its own colour: the app's base styles give every heading the ink colour, which would be dark on the blue. */}
        <h3 className="text-h4 font-semibold text-white">{title}</h3>
        <div className="flex max-w-sm flex-col gap-1 text-body-sm leading-relaxed text-white/90">
          {children}
        </div>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-1 inline-flex min-h-11 items-center gap-2 rounded-md bg-white px-5 text-body-sm font-medium transition-colors hover:bg-white/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            style={{ color: "#2b3990" }}
          >
            <RotateCw aria-hidden="true" className="size-4" />
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

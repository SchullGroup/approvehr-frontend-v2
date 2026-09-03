"use client";

/**
 * The one fallback that replaces `<html>`/`<body>` themselves, for a crash in
 * `app/layout.tsx` — the single place `app/error.tsx` cannot reach, because
 * that boundary renders *inside* the root layout and a failure in the layout
 * itself has nothing left standing above it to catch the error.
 *
 * Deliberately the plainest file in the app. If the root layout has just
 * failed, this is the worst possible moment to lean on anything that could
 * fail with it — no `MarketingNav`, no design-system components, and no
 * Tailwind classes: Next's own docs for this file say plainly that
 * `global-error` does not include the app's global styles, so a `bg-sand`
 * class here would silently do nothing. Inline styles only, so this still
 * renders something legible regardless.
 *
 * The "back to the homepage" link below is a plain `<a>`, not `next/link`,
 * and deliberately not linted around — a real navigation is a full page load
 * that starts over from nothing, which is the one thing guaranteed to work
 * whatever state the client-side router was in when the layout came down.
 * `next/link` staying inert here would be a dead button wearing a working
 * one's clothes, which is worse than the lint warning it trades for.
 *
 * `retry`, not `reset` — Next 16.3 made `retry` the stable, recommended prop
 * for both `error.tsx` and this file (see `app/error.tsx`'s note).
 */
export default function GlobalError({ retry }: { retry: () => void }) {
  return (
    <html lang="en">
      <body>
        <div
          style={{
            minHeight: "100dvh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "2rem",
            background: "#f4f1ec",
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          }}
        >
          <div style={{ maxWidth: "28rem", textAlign: "center" }}>
            <p
              style={{
                fontSize: "0.8125rem",
                fontWeight: 600,
                letterSpacing: "0.02em",
                textTransform: "uppercase",
                color: "#8a7f6f",
                marginBottom: "0.75rem",
              }}
            >
              Something went wrong
            </p>
            <h1
              style={{
                fontSize: "1.75rem",
                fontWeight: 700,
                color: "#1a1815",
                margin: 0,
              }}
            >
              This page couldn&apos;t load.
            </h1>
            <p style={{ marginTop: "0.875rem", color: "#5c5346", lineHeight: 1.6 }}>
              Something failed badly enough that the whole page came down with
              it. Reloading usually clears it — if it keeps happening, the
              fault is ours, not yours.
            </p>
            <div
              style={{
                marginTop: "1.75rem",
                display: "flex",
                gap: "0.75rem",
                justifyContent: "center",
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                onClick={() => retry()}
                style={{
                  height: "2.75rem",
                  padding: "0 1.5rem",
                  borderRadius: "9999px",
                  border: "none",
                  background: "#1a1815",
                  color: "#fff",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Try again
              </button>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages --
                  see the file header: a real navigation, not next/link, is
                  the point here. */}
              <a
                href="/"
                style={{
                  height: "2.75rem",
                  padding: "0 1.5rem",
                  display: "inline-flex",
                  alignItems: "center",
                  borderRadius: "9999px",
                  border: "1px solid #d9d2c4",
                  color: "#1a1815",
                  fontWeight: 500,
                  textDecoration: "none",
                }}
              >
                Back to the homepage
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}

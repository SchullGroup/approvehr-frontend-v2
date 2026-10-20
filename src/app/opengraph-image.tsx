import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { SITE_URL } from "@/lib/marketing/site";

export const alt =
  "ApproveHR: HR, payroll and hiring intelligence for Nigerian companies";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The wordmark is the real asset, not a copy of it. This file used to carry its
 * own set of the logo's `<path>` data, and that copy had already drifted from
 * `public/brand/logo.svg` (the check-mark's tip read 5.44468 where the asset
 * says 5.54468) before anybody looked. Reading the file means the share card
 * can only ever show the logo the rest of the site shows.
 *
 * Read once, at module scope: the asset does not depend on the request, and
 * this route is generated at build time. `process.cwd()` is the project root.
 */
const logo = await readFile(
  join(process.cwd(), "public/brand/logo.svg"),
  "base64",
);
const logoSrc = `data:image/svg+xml;base64,${logo}`;

/** The logo's 149 × 24 viewBox, scaled to 330 wide. */
const WORDMARK = { width: 330, height: 53 };

/** `approvehr.io`, or whatever `NEXT_PUBLIC_SITE_URL` says this build is. */
const HOST = new URL(SITE_URL).host;

/**
 * The default share-card image for every route that doesn't define its own.
 * Drawn in code rather than saved as a screenshot, so it never goes stale and
 * ships with the page instead of as an asset somebody has to remember to
 * regenerate — the same reasoning as the hand-drawn product mockups. The two
 * page colours below are literal hex in place of each CSS custom property,
 * because Satori (what `ImageResponse` renders through) resolves neither
 * `var()` nor Tailwind classes.
 */
export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "flex-start",
        backgroundColor: "#f6f3ee",
        padding: "80px 96px",
      }}
    >
      {/* Satori needs the size on the element. `alt` is empty because the
          wordmark's words are already the image's own `alt` above. */}
      <img
        src={logoSrc}
        alt=""
        width={WORDMARK.width}
        height={WORDMARK.height}
        style={{ marginBottom: 40 }}
      />
      <div
        style={{
          fontSize: 46,
          fontWeight: 600,
          color: "#14120f",
          maxWidth: 900,
          lineHeight: 1.25,
        }}
      >
        HR, payroll and hiring intelligence for Nigerian companies
      </div>
      <div
        style={{
          marginTop: 28,
          fontSize: 26,
          color: "#6b655c",
        }}
      >
        {HOST}
      </div>
    </div>,
    { ...size },
  );
}

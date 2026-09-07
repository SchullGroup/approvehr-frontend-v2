import type { MetadataRoute } from "next";

/**
 * What makes ApproveHR installable on a phone.
 *
 * ## Why this is worth having at all
 *
 * The reader this product is built for — an owner-manager of a Nigerian SME, or
 * one of their staff clocking in — is on a phone, frequently on a connection
 * that drops. An installed app opens from the home screen with no address bar,
 * survives the browser tab being closed, and is the difference between a tool
 * somebody uses daily and a URL they have to remember.
 *
 * ## `start_url` is the product, not the marketing site
 *
 * Both surfaces are route groups in one Next app, so this manifest is served on
 * `/` as well as `/dashboard`. Somebody who installs from the public site means
 * "give me ApproveHR", and landing them on a sales page they have already read
 * would be the wrong answer. The auth gate handles the rest: an installed app
 * opened by somebody signed out shows the sign-in screen, which is where they
 * needed to be.
 *
 * ## The icons are generated from the real mark, on a plate
 *
 * `public/brand/mark.svg` is 697x444 and an app icon is square, so the mark is
 * *fitted* inside a brand-indigo plate with 18% padding rather than stretched.
 * The padding is what makes `maskable` safe: Android crops an icon to whatever
 * shape the launcher uses, and a mark drawn to the edges loses its corners.
 *
 * Each size is listed twice, once `any` and once `maskable`, pointing at the
 * same file. The spec allows `purpose: "any maskable"` on one entry and Next's
 * type does not, so this is the equivalent written out. Declaring only
 * `maskable` would make Chrome add a plate of its own on surfaces that do not
 * crop, putting our plate inside another one.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ApproveHR",
    short_name: "ApproveHR",
    description:
      "HR, payroll and hiring for Nigerian companies. Run payroll, book leave, " +
      "clock in and approve what needs approving.",
    start_url: "/dashboard",
    /* `standalone`, not `fullscreen`: this is a business tool people read, and
       taking the status bar away hides the clock and the battery from somebody
       checking whether they are late. */
    display: "standalone",
    orientation: "portrait",
    /* The canvas colour, so the splash screen does not flash white before the
       app paints. Matches `--color-canvas`'s dark value rather than the light
       one, because a bright flash at 6am is the one people notice. */
    background_color: "#0e1621",
    /* `--color-accent`, the logo wordmark indigo. */
    theme_color: "#2b3990",
    categories: ["business", "productivity", "finance"],
    icons: [
      {
        src: "/brand/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/brand/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    /* Straight to the two things somebody opens the app on a phone to do.
       Deliberately short: Android shows three or four and a long list is a menu
       nobody reads on a long-press. */
    shortcuts: [
      {
        name: "Clock in or out",
        short_name: "Clock in",
        url: "/people/attendance",
      },
      {
        name: "Book time off",
        short_name: "Leave",
        url: "/people/leave",
      },
      {
        name: "What needs approving",
        short_name: "Approvals",
        url: "/approvals",
      },
    ],
  };
}

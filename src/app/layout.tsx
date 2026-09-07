import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "ApproveHR",
    template: "%s · ApproveHR",
  },
  description:
    "Your HR intelligence partner: one platform for people, payroll and hiring, built for teams across Africa.",
  icons: {
    icon: "/brand/mark.svg",
    /* iOS ignores the manifest's icons entirely and reads this. Without it an
       app added to a Home Screen gets a screenshot of the page as its icon,
       which is unrecognisable at 60px. */
    apple: "/brand/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "ApproveHR",
    /* `default` keeps the status bar legible on both themes. `black-translucent`
       draws the page under the clock, which on a screen whose first row is a
       payroll figure puts the time on top of the money. */
    statusBarStyle: "default",
  },
};

/**
 * The viewport, split out because Next wants it separately from `metadata`.
 *
 * `maximumScale` and `userScalable` are deliberately **not set**. Locking zoom
 * is the single most common accessibility mistake in a mobile web app, and this
 * product's readers are frequently over fifty — the same argument that put a
 * 14px floor under the type scale and gated it in `verify-typescale`. A payroll
 * figure somebody cannot enlarge is a payroll figure somebody misreads.
 *
 * `themeColor` carries both schemes so the browser chrome matches the app
 * rather than the other way round.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1621" },
  ],
};

/* Deliberately free of any @/components/ui import. ToastProvider lives in the
   layouts that actually have toast consumers — (app)/layout.tsx and
   design-system/layout.tsx — so this file stays portable into the standalone
   marketing repo (see scripts/export-marketing.ts). */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={GeistSans.variable} suppressHydrationWarning>
      {/**
       * `suppressHydrationWarning` on `<html>` and `<body>`, and nowhere else.
       *
       * `<html>`'s reason arrived later than `<body>`'s and is a different
       * cause with the same shape: the app-side layouts — `(app)`, `(setup)`,
       * `(auth)`, never this shared root — each mount a blocking inline
       * `<script>` (`lib/theme-init-script.ts`) that sets `data-theme="dark"`
       * directly via `document.documentElement` before React hydrates, so a
       * dark-mode visitor never sees a flash of the light theme. React's
       * hydration check compares the *whole* attribute set actually present on
       * `<html>` against what it rendered, not just attributes it asserted a
       * value for — so an attribute added by that script, before hydration,
       * still reads as a mismatch unless this is here. Confirmed live: the
       * warning appeared the moment `data-theme` was introduced and disappeared
       * with this prop, on every route, marketing included, where the app-side
       * script never runs and the attribute is simply never present.
       *
       * `<body>`'s reason is older: browser extensions write attributes onto
       * `<body>` before React hydrates. Grammarly is the one seen here —
       * `data-gr-ext-installed` and `data-new-gr-c-s-check-loaded` — and it
       * produces a console error on every page load that names our
       * `layout.tsx` and looks like a defect in this app. It is not: the
       * server rendered a bare `<body>`, and something outside React added
       * attributes to it before hydration.
       *
       * **Both only work one level deep.** This silences a mismatch on
       * `<html>`'s and `<body>`'s own attributes and text, and nothing about
       * any component inside them, so a genuine hydration bug — the
       * `localStorage`-read-during-render class this codebase has had before,
       * which `lib/store/persisted.ts` exists to prevent — still reports
       * exactly as loudly as it did.
       *
       * Do not spread this to other elements to quieten a warning. Anywhere but
       * these two, a mismatch is ours and the warning is the point.
       */}
      <body suppressHydrationWarning>
        <a href="#main" className="skip-link focus:left-0">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}

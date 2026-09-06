import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "ApproveHR",
    template: "%s · ApproveHR",
  },
  description:
    "Your HR intelligence partner: one platform for people, payroll and hiring, built for teams across Africa.",
  icons: { icon: "/brand/mark.svg" },
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

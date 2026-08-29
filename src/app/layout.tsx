import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "ApproveHR",
    template: "%s · ApproveHR",
  },
  description:
    "One platform for people, payroll and hiring. Built for teams across Africa.",
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
    <html lang="en" className={GeistSans.variable}>
      {/**
       * `suppressHydrationWarning` on `<body>`, and nowhere else.
       *
       * Browser extensions write attributes onto `<body>` before React
       * hydrates. Grammarly is the one seen here — `data-gr-ext-installed` and
       * `data-new-gr-c-s-check-loaded` — and it produces a console error on
       * every page load that names our `layout.tsx` and looks like a defect in
       * this app. It is not: the server rendered a bare `<body>`, and something
       * outside React added attributes to it before hydration.
       *
       * **It only works one level deep.** This silences a mismatch on `<body>`'s
       * own attributes and text, and nothing about any component inside it, so
       * a genuine hydration bug — the `localStorage`-read-during-render class
       * this codebase has had before, which `lib/store/persisted.ts` exists to
       * prevent — still reports exactly as loudly as it did.
       *
       * Do not spread this to other elements to quieten a warning. Anywhere but
       * `<html>` and `<body>`, a mismatch is ours and the warning is the point.
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

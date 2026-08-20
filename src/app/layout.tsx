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
      <body>
        <a href="#main" className="skip-link focus:left-0">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}

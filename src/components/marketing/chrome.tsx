"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, Menu, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Logo, LogoMark } from "@/components/brand/logo";
import { MODULES } from "@/lib/marketing/modules";
import { appNavLinks, internalNavLinks, newTabIfApp } from "@/lib/marketing/links";
import { LEGAL_LINKS } from "@/lib/marketing/legal";
import { Pill } from "./pill";

/**
 * Sitewide offer banner. Sits above the nav on every marketing page.
 * Dismissible per session so it does not block repeat visitors.
 */
export function AnnouncementBar() {
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  return (
    <div className="relative bg-accent px-4 py-2.5 text-center text-white">
      <p className="inline text-body-sm font-medium">
        <span className="font-bold">First month free. Migration on us.</span>
        {" "}Start with your full team, move your data, pay nothing until month two.
      </p>
      <Link
        href="/demo"
        className="ml-3 inline-flex items-center gap-1 text-body-sm font-semibold underline underline-offset-2 hover:no-underline"
      >
        Book a demo <ArrowRight className="size-3.5" aria-hidden />
      </Link>
      <button
        onClick={() => setVisible(false)}
        aria-label="Dismiss offer"
        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 opacity-60 hover:opacity-100"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}

/**
 * Floating nav. Sits on the sand ground as a rounded bar rather than a full
 * width band, and gains a hairline plus a stronger shadow once the page
 * scrolls, so it separates from content without being heavy at rest.
 */
export function MarketingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [productOpen, setProductOpen] = useState(false);

  /* Empty in the standalone marketing build, where there is no app to sign
     into — see lib/marketing/links.ts. */
  const appLinks = appNavLinks();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* Close the mobile sheet if the viewport grows past the breakpoint. */
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => mq.matches && setOpen(false);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return (
    <header className="sticky top-0 z-50 px-4 pt-4">
      <nav
        aria-label="Main"
        className={cn(
          "mx-auto flex max-w-5xl items-center gap-2 rounded-full bg-white/90 px-3 py-2 backdrop-blur-md transition-shadow duration-300",
          scrolled
            ? "shadow-[0_2px_10px_rgb(20_18_15/0.08),0_12px_32px_-12px_rgb(20_18_15/0.14)]"
            : "shadow-[0_1px_3px_rgb(20_18_15/0.05)]",
        )}
      >
        <Link
          href="/"
          aria-label="ApproveHR home"
          className="rounded-full px-2 py-1 text-slate transition-opacity hover:opacity-70"
        >
          <Logo size={22} />
        </Link>

        {/* Desktop links */}
        <div className="ml-2 hidden items-center gap-1 lg:flex">
          <div
            className="relative"
            onMouseEnter={() => setProductOpen(true)}
            onMouseLeave={() => setProductOpen(false)}
          >
            <button
              aria-expanded={productOpen}
              onClick={() => setProductOpen((v) => !v)}
              className="flex items-center gap-1 rounded-full px-3 py-2 text-body-sm text-slate-soft transition-colors hover:text-slate"
            >
              Product
              <ChevronDown
                aria-hidden="true"
                className={cn(
                  "size-3.5 transition-transform duration-200",
                  productOpen && "rotate-180",
                )}
              />
            </button>

            {productOpen && (
              <div className="absolute left-0 top-full w-110 pt-2">
                <div className="animate-scale-in grid grid-cols-2 gap-1 rounded-2xl bg-white p-2 shadow-[0_8px_16px_-4px_rgb(20_18_15/0.08),0_24px_48px_-12px_rgb(20_18_15/0.18)]">
                  {MODULES.map((m) => (
                    <Link
                      key={m.id}
                      href={`/product/${m.id}`}
                      onClick={() => setProductOpen(false)}
                      className="rounded-xl px-3 py-2.5 transition-colors hover:bg-sand"
                    >
                      <span className="block text-body-sm font-medium text-slate">
                        {m.label}
                      </span>
                      <span className="mt-0.5 block text-meta leading-snug text-slate-muted">
                        {m.headline}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          <Link
            href="/pricing"
            className="rounded-full px-3 py-2 text-body-sm text-slate-soft transition-colors hover:text-slate"
          >
            Pricing
          </Link>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {appLinks
            .filter(([, label]) => label === "Sign in")
            .map(([href, label]) => (
              <Link
                key={label}
                href={href}
                {...newTabIfApp(href)}
                className="hidden rounded-full px-3 py-2 text-body-sm text-slate-soft transition-colors hover:text-slate sm:block"
              >
                {label}
              </Link>
            ))}
          <Pill href="/demo" variant="solid" className="hidden sm:inline-flex">
            Book a demo
          </Pill>

          <button
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            className="rounded-full p-2 text-slate lg:hidden"
          >
            {open ? (
              <X aria-hidden="true" className="size-5" />
            ) : (
              <Menu aria-hidden="true" className="size-5" />
            )}
          </button>
        </div>
      </nav>

      {/* Mobile sheet */}
      {open && (
        <div className="animate-scale-in mx-auto mt-2 max-w-5xl rounded-2xl bg-white p-3 shadow-[0_16px_40px_-12px_rgb(20_18_15/0.22)] lg:hidden">
          <p className="px-3 pb-1.5 pt-2 text-meta text-slate-muted">
            Product
          </p>
          {MODULES.map((m) => (
            <Link
              key={m.id}
              href={`/product/${m.id}`}
              onClick={() => setOpen(false)}
              className="block rounded-xl px-3 py-2 text-body transition-colors hover:bg-sand"
            >
              {m.label}
            </Link>
          ))}
          <div className="mt-2 border-t border-sand-line pt-2">
            {(
              [
                ["/pricing", "Pricing"],
                ...appLinks.filter(([, label]) => label !== "Live demo"),
              ] as [string, string][]
            ).map(([href, label], i) => (
              <Link
                key={i}
                href={href}
                onClick={() => setOpen(false)}
                {...newTabIfApp(href)}
                className="block rounded-xl px-3 py-2 text-body transition-colors hover:bg-sand"
              >
                {label}
              </Link>
            ))}
          </div>
          <Pill href="/demo" variant="solid" className="mt-2 w-full">
            Book a demo
          </Pill>
        </div>
      )}
    </header>
  );
}

/* -------------------------------------------------------------------------- */

const FOOTER_LINKS: { heading: string; links: [string, string][] }[] = [
  {
    heading: "Product",
    links: MODULES.map((m) => [`/product/${m.id}`, m.label] as [string, string]),
  },
  {
    heading: "Company",
    links: [
      ["/pricing", "Pricing"],
      ["/demo", "Book a demo"],
      ...appNavLinks().filter(([, label]) => label === "Live demo"),
      ...internalNavLinks(),
    ],
  },
  {
    /* Derived from LEGAL_DOCS so a new document appears here automatically and
       this column can never point at a page that was renamed or removed. */
    heading: "Legal",
    links: LEGAL_LINKS,
  },
];

export function MarketingFooter() {
  return (
    <footer className="border-t border-sand-line bg-sand-deep">
      <div className="container-page py-16">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <Logo size={24} className="text-slate" />
            <p className="mt-4 max-w-xs text-body-sm leading-relaxed text-slate-muted">
              HR, payroll and hiring intelligence for Nigerian companies.
              Built around the statutory obligations you already have.
            </p>
          </div>

          {FOOTER_LINKS.map((group) => (
            <div key={group.heading}>
              <h3 className="text-meta font-semibold text-slate-muted">
                {group.heading}
              </h3>
              <ul className="mt-4 flex flex-col gap-2.5">
                {group.links.map(([href, label]) => (
                  <li key={label}>
                    <Link
                      href={href}
                      {...newTabIfApp(href)}
                      className="text-body-sm text-slate-soft transition-colors hover:text-slate"
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-wrap items-center justify-between gap-4 border-t border-sand-line pt-6">
          <div className="flex items-center gap-2.5">
            <LogoMark size={18} className="text-slate" />
            <p className="text-meta text-slate-muted">
              © {new Date().getFullYear()} ApproveHR, a Schull Technologies
              company. Lagos, Nigeria.
            </p>
          </div>
          <p className="text-meta text-slate-muted">
            Registered under the Nigeria Data Protection Act 2023.
          </p>
        </div>
      </div>
    </footer>
  );
}

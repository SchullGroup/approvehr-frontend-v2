import type { Metadata } from "next";
import { AnnouncementBar, MarketingFooter, MarketingNav } from "@/components/marketing/chrome";
import { Pill } from "@/components/marketing/pill";
import { StatusPage } from "@/components/marketing/status-page";
import { MODULES } from "@/lib/marketing/modules";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false },
};

/**
 * Next's catch-all for any URL that matches no route at all. It renders
 * inside the bare root layout only — no `(marketing)` or `(app)` chrome
 * wraps it, because neither segment matched — so this page brings its own,
 * reusing the same marketing nav/footer rather than shipping Next's
 * unstyled default.
 *
 * A route inside `(app)` that fails to resolve a record deliberately does
 * NOT reach this file — see the `notFound()` comments in the hiring and
 * payroll screens, which render an inline "not found" state instead so a
 * link the product itself gave someone never dead-ends. This page is only
 * for a URL nothing in the app recognises at all.
 */
export default function NotFound() {
  return (
    <div className="bg-sand">
      <AnnouncementBar />
      <MarketingNav />
      <main id="main">
        <StatusPage
          eyebrow="Error 404"
          code="404"
          title="This page took a wrong turn."
          description="There's nothing at that address. It may have moved, or the link was mistyped."
          actions={
            <>
              <Pill href="/" variant="dark" arrow>
                Back to the homepage
              </Pill>
              <Pill href="/demo" variant="quiet">
                Book a demo instead
              </Pill>
            </>
          }
        />

        <section className="border-t border-sand-line px-4 py-16">
          <div className="container-page">
            <p className="text-center text-body-sm font-medium text-slate-muted">
              Or find your way to a module directly
            </p>
            <ul className="mx-auto mt-6 flex max-w-3xl flex-wrap items-center justify-center gap-2">
              {MODULES.map((m) => (
                <li key={m.id}>
                  <Pill href={`/product/${m.id}`} variant="quiet" size="md">
                    {m.label}
                  </Pill>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}

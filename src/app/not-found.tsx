import type { Metadata } from "next";
import {
  AnnouncementBar,
  MarketingFooter,
  MarketingNav,
} from "@/components/marketing/chrome";
import { Pill } from "@/components/marketing/pill";
import { StatusPage } from "@/components/marketing/status-page";
import { MODULES } from "@/lib/marketing/modules";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false },
};

/**
 * The public site's 404, in its own chrome — and now **only** that.
 *
 * Next sends here when nothing nearer catches a `notFound()`. It renders in the
 * bare root layout, so this page brings the marketing nav and footer itself.
 *
 * Two things used to land here that should not have:
 *
 * - **A signed-in person's mistyped address.** They got the sales site, with a
 *   Book a demo button, in the middle of the product. `(app)/[...rest]` now
 *   claims every address no route matches and `(app)/not-found.tsx` answers it
 *   inside the product's own layout.
 * - **A public page that does not exist** (an unknown careers company). That
 *   rendered inside the `(marketing)` layout, which already draws this same nav
 *   and footer, so the page carried them twice. `(marketing)/not-found.tsx`
 *   answers it with the body only.
 *
 * What still reaches this file is a `notFound()` from a route outside both
 * groups, such as `/design-system` in a production build.
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

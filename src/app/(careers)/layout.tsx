import { SITE_URL } from "@/lib/marketing/site";

/**
 * A company's careers pages, in the employer's own frame (UAT 23 Nov, U89 /
 * PERF-9).
 *
 * They used to sit in the `(marketing)` group, so a job seeker reading
 * Schulltech's roles got ApproveHR's announcement bar ("First month free…"),
 * its product nav, its Book a demo button and its full sales footer around them.
 * The page is the employer's: its brand header (`CareersBrand`, drawn by each
 * page from the API's branding) is the top of the page, and the only trace of
 * the product is one line at the foot.
 */
export default function CareersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-sand text-slate-soft">
      <main id="main" className="flex-1">
        {children}
      </main>
      <footer
        data-testid="careers-footer"
        className="border-t border-sand-line px-4 py-5"
      >
        <p className="container-page text-meta text-slate-muted">
          Careers page powered by{" "}
          <a
            href={SITE_URL}
            className="underline underline-offset-2 hover:text-slate"
          >
            ApproveHR
          </a>
        </p>
      </footer>
    </div>
  );
}

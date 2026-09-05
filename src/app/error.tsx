"use client";

import { useEffect } from "react";
import { AnnouncementBar, MarketingFooter, MarketingNav } from "@/components/marketing/chrome";
import { Pill, PillButton } from "@/components/marketing/pill";
import { StatusPage } from "@/components/marketing/status-page";

/**
 * Next's error boundary for anything under the root layout with no closer
 * `error.tsx` of its own. Must be a Client Component — Next requires it, so
 * `retry` can re-fetch and re-render the segment without a full page reload.
 *
 * `retry`, not `reset`: this repo runs Next 16.3, where `retry` became the
 * stable prop and the docs say to prefer it — `reset` still exists but is now
 * the fallback for the narrower case of re-rendering without re-fetching. Get
 * this one wrong and it still compiles and still runs, which is exactly the
 * kind of drift AGENTS.md warns about — check the version's own docs, not
 * training data.
 *
 * This is the one Next actually reaches for a render crash; it replaces only
 * the failed segment, not `<html>`/`<body>`, so `app/global-error.tsx` (which
 * has to) is the separate, rarer fallback for a crash in the root layout
 * itself.
 *
 * Nothing here reports the error anywhere — there is no error-tracking
 * service wired into this repo, and pretending to send one would be the
 * "green Paid button that moved no money" mistake this codebase's own
 * HANDOVER warns against elsewhere. `console.error` is the whole of it.
 */
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("Rendering failed:", error);
  }, [error]);

  return (
    <div className="bg-sand">
      <AnnouncementBar />
      <MarketingNav />
      <main id="main">
        <StatusPage
          eyebrow="Something went wrong"
          title="That didn't load right."
          description="Something on this page failed to render. Trying again usually clears it. If it keeps happening, the fault is ours, not yours."
          actions={
            <>
              <PillButton type="button" variant="dark" arrow onClick={() => retry()}>
                Try again
              </PillButton>
              <Pill href="/" variant="quiet">
                Back to the homepage
              </Pill>
            </>
          }
        />
      </main>
      <MarketingFooter />
    </div>
  );
}

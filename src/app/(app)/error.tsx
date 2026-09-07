"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Button, ButtonLink, Card, CardBody } from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { reportError } from "@/lib/report-error";

/**
 * The signed-in app's error boundary.
 *
 * ## Why this file has to exist separately
 *
 * There were **no route-level boundaries at all** — only `app/error.tsx` at the
 * root. That one is dressed in marketing chrome: announcement bar, marketing
 * nav, sand background, a `StatusPage`. Correct for a crash on the public site,
 * and badly wrong for the product, because Next reaches for the nearest
 * boundary above the failure. A crash anywhere inside `/payroll/runs/new`
 * therefore replaced the whole signed-in segment with a page selling ApproveHR
 * to somebody who is already using it, and dropped them out of the sidebar,
 * their session context and any way back to what they were doing.
 *
 * Sitting inside `(app)/layout.tsx` means the shell, the nav and the toast
 * provider are all still mounted around this. So the reader keeps the product
 * and loses one panel, which is the whole point of a boundary.
 *
 * `retry`, not `reset` — Next 16.3 made `retry` the stable prop and `reset` the
 * narrower fallback. Getting it wrong still compiles and still runs, which is
 * the drift `AGENTS.md` warns about.
 *
 * ## What it tells the reader, and what it does not
 *
 * Not the message. `error.message` on a production build is a minified string
 * or a generic one, and on a development build it is a stack trace — neither is
 * something to put in front of somebody doing payroll. The `digest` **is**
 * shown, because it is the one thing that lets support tie this screen to the
 * server-side log line, and it is meaningless to anybody else.
 */
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const pathname = usePathname();

  useEffect(() => {
    /* The route, not the URL: `/people/[id]` rather than the id of whoever's
       record happened to be open. See `lib/report-error.ts` on why a crash
       report must not carry personal data. */
    reportError(error, {
      route: pathname ?? undefined,
      ...(error.digest ? { digest: error.digest } : {}),
    });
  }, [error, pathname]);

  return (
    <>
      <PageHeader title="Something went wrong on this screen" />
      <PageBody>
        <Card>
          <CardBody className="flex flex-col items-start gap-4">
            <div className="flex items-start gap-3">
              <AlertTriangle
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0 text-danger-text"
              />
              <div className="flex flex-col gap-1">
                <p className="text-body text-ink">
                  This part of the page could not be shown. Nothing you were
                  looking at has changed, and nothing has been saved or sent.
                </p>
                <p className="text-body-sm text-muted">
                  Trying again reloads just this screen. If it keeps happening,
                  the reference below is what support needs.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" size="sm" onClick={retry}>
                Try again
              </Button>
              <ButtonLink href="/dashboard" variant="secondary" size="sm">
                Back to home
              </ButtonLink>
            </div>

            {error.digest && (
              <p className="text-meta text-faint">
                Reference{" "}
                <span className="font-mono tabular text-muted">
                  {error.digest}
                </span>
              </p>
            )}
          </CardBody>
        </Card>
      </PageBody>
    </>
  );
}

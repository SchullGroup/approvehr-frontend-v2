import type { Metadata } from "next";
import { NotFoundState } from "@/components/portal/not-found-state";
import { PageBody, PageHeader } from "@/components/portal/shell";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false },
};

/**
 * What a signed-in person sees when a route inside the product calls
 * `notFound()`, and — through `[...rest]/page.tsx` — when they type an address
 * nothing matches.
 *
 * It renders inside the app's own layout, so the sidebar and the header are
 * still there and the person is never thrown out into the marketing site's chrome
 * with a Book a demo button. That is the whole reason this file exists: Next
 * falls back to `app/not-found.tsx` when no closer one is found, and that one
 * belongs to the public site.
 */
export default function AppNotFound() {
  return (
    <>
      <PageHeader title="Page not found" />
      <PageBody>
        <NotFoundState />
      </PageBody>
    </>
  );
}

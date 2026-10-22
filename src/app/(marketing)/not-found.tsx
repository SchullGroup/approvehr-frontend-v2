import type { Metadata } from "next";
import { StatusPage } from "@/components/marketing/status-page";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false },
};

/**
 * A page on the public site that does not exist — most often a careers link for
 * a company that is not there, which the API deliberately answers the same way
 * for "no such company", "archived" and "never published" so the page cannot be
 * used to find out who is a customer.
 *
 * This is **only the body**. The `(marketing)` layout already draws the
 * announcement bar, the nav and the footer, and the root `app/not-found.tsx`
 * draws its own because it renders outside any layout group. Falling through to
 * that one from here put the chrome on the page twice — a second nav under the
 * first — which is what this file replaces. No action either: the useful
 * next step for a candidate is the link they were sent, and "Back to the
 * homepage" would have taken them to a sign-in screen.
 */
export default function MarketingNotFound() {
  return (
    <StatusPage
      eyebrow="Error 404"
      code="404"
      title="This page took a wrong turn."
      description="There's nothing at that address. It may have moved, or the link was mistyped. If you were sent it, check it with whoever sent it."
      actions={null}
    />
  );
}

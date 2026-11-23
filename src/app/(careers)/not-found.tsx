import type { Metadata } from "next";
import { StatusPage } from "@/components/marketing/status-page";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false },
};

/**
 * A careers link for a company that is not there, which the API deliberately
 * answers the same way for "no such company", "archived" and "never published"
 * so the page cannot be used to find out who is a customer.
 *
 * Only the body: the `(careers)` layout draws the one-line footer. No action,
 * because the useful next step for a candidate is the link they were sent.
 */
export default function CareersNotFound() {
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

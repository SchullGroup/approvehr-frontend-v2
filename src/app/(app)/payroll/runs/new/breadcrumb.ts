/**
 * The page's breadcrumb, in a file with no `"use client"`.
 *
 * `page.tsx` is a server component and renders the header around the Suspense
 * boundary; `wizard.tsx` is a client component and renders the same header once
 * it knows whether there is anything to put in its action slot. A plain value
 * exported from a client module reaches a server component as a reference, not
 * as data, so the one copy lives here and both import it.
 */
export const RUN_BREADCRUMB = [
  { href: "/payroll", label: "Monthly payroll" },
  { href: "/payroll/runs/new", label: "Run payroll" },
];

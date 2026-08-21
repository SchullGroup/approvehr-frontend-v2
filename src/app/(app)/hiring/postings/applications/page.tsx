import type { Metadata } from "next";
import { ApplicationsScreen } from "./applications-screen";

export const metadata: Metadata = {
  title: "Applications",
  description:
    "Everyone who applied through your careers page, with screening in and turning down on the row.",
};

/**
 * The advert filter is read here, on the server, and handed down as a prop —
 * the same call `settings/audit/page.tsx` makes, and for the same reason:
 * `useSearchParams` in the screen would push the whole page behind a Suspense
 * boundary for one string, and the "3 waiting" link from the advert list would
 * arrive unfiltered on the first paint.
 */
export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ posting?: string | string[] }>;
}) {
  const params = await searchParams;
  const posting = Array.isArray(params.posting)
    ? params.posting[0]
    : params.posting;

  return <ApplicationsScreen initialPostingId={posting ?? ""} />;
}

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
 *
 * `status` rides the same way: the advert list's own applicant count links
 * here with `status=ALL`, because "how many applied" and "how many are still
 * waiting" are different questions, and the count answers the first one. Any
 * of the screen's own filter values work the same way — `status=ADVANCED`,
 * `status=DECLINED` — so a "Screened in" figure elsewhere in the module can
 * land on the tab that answers it rather than always on "Waiting".
 */
export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    posting?: string | string[];
    status?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const posting = Array.isArray(params.posting)
    ? params.posting[0]
    : params.posting;
  const status = Array.isArray(params.status)
    ? params.status[0]
    : params.status;

  return (
    <ApplicationsScreen
      initialPostingId={posting ?? ""}
      initialStatus={status ?? ""}
    />
  );
}

import type { Metadata } from "next";
import { PerformanceScreen } from "./performance-screen";
import { isPerformanceTab } from "./tabs";

export const metadata: Metadata = {
  title: "Performance",
  description:
    "What is waiting on you, the KPIs behind it, and the appraisal periods a mark is given inside.",
};

/**
 * One `/performance`, rendered by role.
 *
 * Staff see their own KPIs, a manager sees their team's, and whoever holds
 * `EDIT_RECORDS` sees the company's — decided inside the screen from
 * `useIsManager()` and `useCan()`, not by the URL. The incumbent has five routes
 * for this (`/performance/executive`, `/performance/manager`,
 * `/performance/my-objectives`, and two more) and that is why its nav is
 * unusable. PARITY.md Rule 1.
 *
 * The tab is read here, on the server, and handed down as a prop.
 * `useSearchParams` in the screen would force the whole page into a Suspense
 * boundary and a client-side read for one string.
 *
 * `now` is the default, and it used to be `periods`. A list of periods is not
 * what somebody arrives to find out — "where is this up to" is, and that was two
 * clicks away. The overview carries the running period's state for whoever is
 * running it (`period-status.tsx`) and the work list for everybody, so it is the
 * right landing for every reader rather than for one of them.
 *
 * It is also the one tab nobody can be refused: `periods` is gated on
 * `canManage || canSeeCompany`, so defaulting there sent staff to a fallback on
 * every single load.
 */
export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { tab } = await searchParams;
  const single = Array.isArray(tab) ? tab[0] : tab;
  return (
    <PerformanceScreen
      initialTab={isPerformanceTab(single) ? single : "now"}
    />
  );
}

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
 * `periods` is the default: a period is the thing somebody opens this module
 * to work on. `PerformanceScreen` still falls back to `now` on its own if the
 * signed-in person cannot see periods at all — staff always land on `now`
 * regardless of what is requested here, because periods is gated on
 * `canManage || canSeeCompany` and `now` is the one tab everybody has.
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
      initialTab={isPerformanceTab(single) ? single : "periods"}
    />
  );
}

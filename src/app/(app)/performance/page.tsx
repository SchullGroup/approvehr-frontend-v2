import type { Metadata } from "next";
import { PerformanceScreen } from "./performance-screen";
import { isPerformanceTab } from "./tabs";

export const metadata: Metadata = {
  title: "Performance",
  description:
    "KPIs with the measures behind them, appraisals on a cycle, and skills against their targets.",
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
 */
export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { tab } = await searchParams;
  const single = Array.isArray(tab) ? tab[0] : tab;
  return (
    <PerformanceScreen initialTab={isPerformanceTab(single) ? single : "kpis"} />
  );
}

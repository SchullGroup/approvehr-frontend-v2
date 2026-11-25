import { redirect } from "next/navigation";

/**
 * The list of appraisal periods is the Performance Overview now (owner,
 * 24 Nov 2026): Open and History are tabs there. An old link lands on it.
 */
export default function PerformancePeriodsPage() {
  redirect("/performance");
}

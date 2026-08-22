import type { Metadata } from "next";
import { ScoreHistoryScreen } from "./history-screen";

export const metadata: Metadata = {
  title: "Appraisal history",
  description:
    "One person's mark period by period: the trend, what each mark was made of, and the periods with no mark at all.",
};

/**
 * One person across cycles.
 *
 * This is what makes performance longitudinal rather than a form once a year,
 * and it is the read the incumbent has (`appraisal-history/employee_history`,
 * `rating_trends`) and we did not.
 *
 * No `generateStaticParams`: an employee id is a uuid connected and a demo
 * constant offline, and the trend itself only exists connected — the client
 * decides.
 */
export default async function ScoreHistoryPage({
  params,
}: {
  params: Promise<{ employeeId: string }>;
}) {
  const { employeeId } = await params;
  return <ScoreHistoryScreen employeeId={employeeId} />;
}

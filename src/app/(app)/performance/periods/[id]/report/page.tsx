import type { Metadata } from "next";
import { PeriodReportScreen } from "./report-screen";

export const metadata: Metadata = {
  title: "Period report",
  description:
    "How the period went: how marks are spread, what has come in, and who is still missing a mark or a final rating.",
};

/**
 * The outcome of one appraisal period.
 *
 * A route rather than a tab on the period screen, for the reason that screen's
 * own header gives: it answers a different question. The period screen is "who is
 * not finished" and is read while the period is open; this is "how did it come
 * out" and is read afterwards, usually by somebody who has to explain a decision
 * that was made from it.
 *
 * No `generateStaticParams`: a period id is a uuid connected and a demo constant
 * offline, so this renders on demand and the client decides what exists.
 */
export default async function PeriodReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PeriodReportScreen cycleId={id} />;
}

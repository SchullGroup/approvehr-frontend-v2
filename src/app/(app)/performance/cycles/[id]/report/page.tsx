import type { Metadata } from "next";
import { CycleReportScreen } from "./report-screen";

export const metadata: Metadata = {
  title: "Cycle report",
  description:
    "How a review cycle came out: the spread of marks, what came in, and who finishes unscored or unfinalised, by name.",
};

/**
 * The outcome of one cycle.
 *
 * A route rather than a tab on the cycle screen, for the reason that screen's
 * own header gives: it answers a different question. The cycle screen is "who is
 * not finished" and is read while the period is open; this is "how did it come
 * out" and is read afterwards, usually by somebody who has to explain a decision
 * that was made from it.
 *
 * No `generateStaticParams`: a cycle id is a uuid connected and a demo constant
 * offline, so this renders on demand and the client decides what exists.
 */
export default async function CycleReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CycleReportScreen cycleId={id} />;
}

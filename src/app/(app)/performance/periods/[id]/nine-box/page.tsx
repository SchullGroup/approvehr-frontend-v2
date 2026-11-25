import type { Metadata } from "next";
import { NineBoxScreen } from "./nine-box-screen";

export const metadata: Metadata = {
  title: "Talent map",
  description:
    "Who is ready for more, who to grow, and who needs a conversation, for one appraisal period.",
};

/**
 * The talent grid for one appraisal period.
 *
 * A route rather than a tab on the period screen, on the same reasoning the
 * report is: the period screen is read while a period is open and answers "who
 * is not finished". This is read in a calibration session, by people making
 * decisions about jobs, and it needs the whole width.
 *
 * No `generateStaticParams` — a period id is a uuid connected and a demo
 * constant offline, so this renders on demand.
 */
export default async function NineBoxPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <NineBoxScreen cycleId={id} />;
}

import type { Metadata } from "next";
import { NineBoxScreen } from "./nine-box-screen";

export const metadata: Metadata = {
  title: "Nine-box",
  description:
    "Performance against potential for one appraisal period, with everybody the grid cannot place named rather than assumed.",
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

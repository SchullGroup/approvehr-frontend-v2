import type { Metadata } from "next";
import { PeriodScreen } from "./period-screen";

export const metadata: Metadata = {
  title: "Appraisal period",
  description:
    "Run one appraisal period: what it still needs, who is outstanding, who has nobody appraising them, and where every mark stands.",
};

/**
 * One appraisal period, from the point of view of whoever is running it.
 *
 * The URL says `periods` and the model says `ReviewCycle`. That is deliberate:
 * "cycle" is the engine's word and it had leaked into the interface for the third
 * time — "prepare a run" and "leaver" were the same mistake. The store and the
 * API wrapper still say cycle, because that is what the endpoint is called.
 *
 * No `generateStaticParams`: a period id is a uuid connected and a demo constant
 * offline, so this renders on demand and the client decides whether the period
 * exists — only the client knows which source it is reading.
 */
export default async function PeriodPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PeriodScreen cycleId={id} />;
}

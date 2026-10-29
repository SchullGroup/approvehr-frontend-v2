import type { Metadata } from "next";
import { tabFromQuery } from "@/lib/url-tab";
import { RatingScaleForm } from "./scale-form";
import { SCORING_TABS } from "./tabs";
import { ScoringWeightsForm } from "./weights-form";

export const metadata: Metadata = {
  title: "Appraisal scoring",
  description:
    "How much each part of an appraisal counts towards somebody's mark, and what each mark is called. The weights must make 100% exactly, and both are frozen onto an appraisal period when it starts.",
};

/**
 * Two settings, one screen, because they are two halves of the same question.
 *
 * The weights decide how a mark is *assembled*; the scale decides what the
 * result is *called*. Somebody arriving to change one almost always wants to
 * see the other, and splitting them across two pages would put "what is a 4"
 * somewhere nobody looking at the appraisal settings would find it — the same
 * discoverability failure `Settings → Features` had.
 *
 * The switch for whether forms ask for an overall mark is on the second tab,
 * ahead of the names, because the names are what that page offers. It is not
 * frozen onto a period the way the weights and the names are: it is read when a
 * form opens.
 *
 * `ScoringWeightsForm` owns the page header, because it owns the breadcrumb and
 * the demo badge, and the two are its two tabs: it is handed the scale form to
 * show on the second.
 */
export default async function PerformanceSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { tab } = await searchParams;
  return (
    <ScoringWeightsForm
      initialTab={tabFromQuery(tab, SCORING_TABS, "weights")}
      scale={<RatingScaleForm />}
    />
  );
}

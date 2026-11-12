import type { Metadata } from "next";
import { tabFromQuery } from "@/lib/url-tab";
import { RatingScaleForm } from "./scale-form";
import { SCORING_TABS } from "./tabs";
import { ScoringWeightsForm } from "./weights-form";

export const metadata: Metadata = {
  title: "Appraisal scoring",
  description:
    "How much each part of an appraisal counts towards somebody's mark, what each mark is called, how long the work behind a final rating is kept, and whether people may use their own finished work in their review answers. Each part counts in proportion to the total, and the weights and the names are frozen onto an appraisal period when it starts.",
};

/**
 * Three settings, one screen. The first two are two halves of the same question, because the
 * weights decide how a mark is *assembled* and the scale decides what the result is *called*.
 * Somebody arriving to change one almost always wants to see the other, and splitting them
 * across two pages would put "what is a 4" somewhere nobody looking at the appraisal settings
 * would find it — the same discoverability failure `Settings → Features` had.
 *
 * The switch for whether forms ask for an overall mark is on the second tab, ahead of the names,
 * because the names are what that page offers. It is not frozen onto a period the way the weights
 * and the names are: it is read when a form opens.
 *
 * The third tab, Records, says how long the finished work behind a final rating is kept, and
 * whether people may use their own finished work in their review answers. Neither is about scoring
 * and nothing in either reaches a mark. They are here because they are a company's decisions about
 * the performance module, made once, and a tab on this page is where somebody looking at the
 * appraisal settings would look. See `work-record-card.tsx` and `work-in-answers-card.tsx`.
 *
 * `ScoringWeightsForm` owns the page header, because it owns the breadcrumb and the demo badge,
 * and the three are its tabs: it is handed the scale form to show on the second.
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

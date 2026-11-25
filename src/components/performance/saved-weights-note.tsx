import { InfoTooltip } from "@/components/ui/field";

/**
 * What weighting the manager's overall mark does, behind an info icon.
 *
 * The API sends a long sentence about it (`managerAppraisalNote`); the owner
 * asked on 24 Nov 2026 for it to be short and out of the way, so the callers
 * still use that note to decide *whether* to show this (it exists only when the
 * manager part counts), and this says the short version on hover or focus.
 *
 * It is about the **saved** weights, so once anything typed has moved away from
 * them the tooltip says so first. A tooltip is not the place for a warning, so
 * that is the only thing it adds.
 */
const SHORT =
  "Each appraiser's form needs an overall mark before it can be sent, and the marks count in proportion to the appraisers' shares. A manager's competency levels also count, so their judgement reaches the score twice.";

export function SavedWeightsNote({ moved }: { moved: boolean }) {
  return (
    <InfoTooltip
      label="What the manager appraisal weight does"
      text={`${moved ? "Saved now, not yet changed. " : ""}${SHORT}`}
    />
  );
}

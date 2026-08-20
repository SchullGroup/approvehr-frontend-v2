import { Badge, type BadgeTone } from "@/components/ui";
import { STAGES, type Outcome, type StageId } from "@/lib/types";

/*
 * One canonical mapping from stage to tone. Every board column, table row and
 * candidate header reads from here, so a stage can never look like two
 * different things in two different views.
 */
const STAGE_TONE: Record<StageId, BadgeTone> = {
  sourced: "neutral",
  shortlisted: "info",
  prescreen: "accent",
  interview: "warning",
  selection: "success",
};

const OUTCOME_TONE: Record<Exclude<Outcome, "in_progress">, BadgeTone> = {
  hired: "success",
  rejected: "danger",
  withdrawn: "neutral",
};

const OUTCOME_LABEL: Record<Exclude<Outcome, "in_progress">, string> = {
  hired: "Hired",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

export function stageLabel(id: StageId) {
  return STAGES.find((s) => s.id === id)!.label;
}

export function stageTone(id: StageId) {
  return STAGE_TONE[id];
}

/** Shows the outcome when the candidate has left the pipeline, else the stage. */
export function StagePill({
  stage,
  outcome = "in_progress",
  size = "sm",
}: {
  stage: StageId;
  outcome?: Outcome;
  size?: "sm" | "md";
}) {
  if (outcome !== "in_progress") {
    return (
      <Badge tone={OUTCOME_TONE[outcome]} size={size} dot>
        {OUTCOME_LABEL[outcome]}
      </Badge>
    );
  }
  return (
    <Badge tone={STAGE_TONE[stage]} size={size} dot>
      {stageLabel(stage)}
    </Badge>
  );
}

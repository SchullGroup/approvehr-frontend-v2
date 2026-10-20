import { Badge, type BadgeTone } from "@/components/ui";
import { STATE_LABEL } from "@/lib/hiring/hired/copy";
import type { HireState } from "@/lib/hiring/hired/model";

/** Hired is news, an employee is done, and not joining is a loss, not a fault. */
const TONE: Record<HireState, BadgeTone> = {
  HIRED: "info",
  EMPLOYEE_CREATED: "success",
  DID_NOT_JOIN: "neutral",
};

export function HireStateBadge({ state }: { state: HireState }) {
  return (
    <Badge tone={TONE[state]} size="sm" dot>
      {STATE_LABEL[state]}
    </Badge>
  );
}

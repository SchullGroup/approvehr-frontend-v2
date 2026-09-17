"use client";

import { AssistantOrb } from "@/components/portal/assistant-orb";
import type { Live, Step } from "@/lib/store/ai2-turn";

/**
 * What the assistant is doing, and the answer as it is written. Shared by
 * both `/ai2` surfaces so a turn is narrated in one vocabulary.
 *
 * The narration is **live only**: one line beside the orb saying what is
 * happening now, and nothing left behind once the answer lands. A list of
 * ticked-off lookups above a finished answer is a record of how the sausage
 * was made, sitting where the answer should be — and it grows with the
 * conversation, so by the fourth question most of the card is bookkeeping.
 */

/** A catalogue entity name, in English. Unknown names fall through as-is. */
const RECORD_NAMES: Record<string, string> = {
  employee: "people",
  department: "departments",
  leave_request: "leave requests",
  leave_type: "leave types",
  payroll_run: "payroll runs",
  loan: "loans",
  reimbursement: "expense claims",
  overtime: "overtime",
  wage_advance: "wage advances",
  attendance: "attendance",
  review_cycle: "review cycles",
  goal: "goals",
  ticket: "helpdesk tickets",
  asset: "assets",
  announcement: "announcements",
  onboarding: "onboarding",
  exit: "exits",
};

const recordName = (entity: string | undefined): string =>
  entity === undefined
    ? "your records"
    : (RECORD_NAMES[entity] ?? entity.replace(/_/g, " "));

/**
 * What it is doing right now, in as many words. A lookup in flight wins over
 * a note, because a note is something it said on the way past and a lookup is
 * the thing taking the seconds.
 */
function nowDoing(steps: Step[]): string {
  const running = steps.findLast(
    (step) => step.kind === "lookup" && step.running,
  );
  if (running?.kind === "lookup")
    return `Reading ${recordName(running.entity)}`;

  const note = steps.findLast((step) => step.kind === "note");
  if (note?.kind === "note") return note.text;

  return "Thinking";
}

/** The orb, and one line saying what is happening. */
export function Working({ steps }: { steps: Step[] }) {
  return (
    <p className="flex items-center gap-2 text-body-sm text-muted">
      <AssistantOrb size={18} phase="thinking" />
      {nowDoing(steps)}
    </p>
  );
}

/** The turn in flight — the answer as it is written, plus the caret. */
export function LiveTurn({ live }: { live: Live }) {
  /* Once prose is arriving the caret says it is still going, so the line is
     only worth its space while something else is holding the answer up. */
  const working =
    live.text === "" ||
    live.steps.some((step) => step.kind === "lookup" && step.running);

  return (
    <div className="flex flex-col gap-2">
      {working && <Working steps={live.steps} />}
      {live.text !== "" && (
        <p className="max-w-[44rem] rounded-lg border border-line bg-canvas px-3 py-2 text-body-sm leading-relaxed whitespace-pre-wrap text-ink">
          {live.text}
          <span
            aria-hidden="true"
            className="ml-0.5 inline-block h-4 w-px animate-pulse bg-muted align-text-bottom"
          />
        </p>
      )}
    </div>
  );
}

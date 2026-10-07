"use client";

import { useEffect, useState } from "react";
import { AssistantOrb } from "@/components/portal/assistant-orb";
import type { Live, Step } from "@/lib/store/ai2-turn";

/**
 * What the assistant is doing, and the answer as it is written. Shared by
 * both `/ai2` surfaces so a turn is narrated in one vocabulary.
 *
 * The narration is **live only** — one line beside the orb, gone once the
 * answer lands. A permanent checklist of finished lookups would just grow
 * with the conversation.
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
 * Everything worth saying about this turn, newest last. Finished lookups stay
 * in the list so there's something true to show while the model composes.
 */
function narration(steps: Step[]): string[] {
  const names = [
    ...new Set(
      steps.flatMap((step) =>
        step.kind === "lookup" ? [recordName(step.entity)] : [],
      ),
    ),
  ];
  if (names.length > 0) return names.map((name) => `Reading ${name}`);

  const note = steps.findLast((step) => step.kind === "note");
  if (note?.kind === "note") return [note.text];

  return ["Thinking"];
}

/**
 * Lookups finish too fast to show only the one in flight, so these rotate
 * through the composing delay instead. `LiveTurn` unmounts this the moment
 * prose arrives, so nothing here holds the answer back.
 */
const ROTATE_MS = 1300;

function useRotating(items: string[]): string {
  const key = items.join("\n");
  const [index, setIndex] = useState(0);

  /* Keyed on the list, not the newest item, so a lookup arriving mid-rotation
     restarts the clock instead of cutting the current line short. */
  useEffect(() => {
    if (items.length < 2) return undefined;
    const id = setInterval(
      () => setIndex((current) => (current + 1) % items.length),
      ROTATE_MS,
    );
    return () => clearInterval(id);
  }, [key, items.length]);

  return items.length === 0 ? "" : (items[index % items.length] ?? "");
}

/** The orb, and one line saying what is happening. */
export function Working({ steps }: { steps: Step[] }) {
  const label = useRotating(narration(steps));

  return (
    <p
      aria-live="polite"
      className="flex items-center gap-2 text-body-sm text-muted"
    >
      <AssistantOrb size={18} phase="thinking" />
      {label}
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

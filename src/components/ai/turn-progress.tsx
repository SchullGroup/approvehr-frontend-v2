"use client";

import { Check, CircleSlash } from "lucide-react";
import { AssistantOrb } from "@/components/portal/assistant-orb";
import type { Live, Step } from "@/lib/store/ai2-turn";

/**
 * What the assistant is doing, and the answer as it is written. Shared by
 * both `/ai2` surfaces so a turn is narrated in one vocabulary.
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

/** What it did, in order. `pending` covers the gap before anything is reported. */
export function Steps({
  steps,
  pending = false,
}: {
  steps: Step[];
  pending?: boolean;
}) {
  if (steps.length === 0 && !pending) return null;

  return (
    <ul className="flex flex-col gap-1">
      {pending && steps.length === 0 && (
        <li className="flex items-center gap-2 text-body-sm text-muted">
          <AssistantOrb size={18} phase="thinking" />
          Thinking
        </li>
      )}
      {steps.map((step) =>
        step.kind === "note" ? (
          <li key={step.key} className="text-body-sm text-muted italic">
            {step.text}
          </li>
        ) : (
          <li
            key={step.key}
            className="flex items-center gap-2 text-body-sm text-muted"
          >
            {step.running ? (
              <AssistantOrb size={18} phase="thinking" />
            ) : step.refused ? (
              <CircleSlash
                aria-hidden="true"
                className="size-3.5 text-danger-text"
              />
            ) : (
              <Check
                aria-hidden="true"
                className="size-3.5 text-success-text"
              />
            )}
            {step.running
              ? `Reading ${recordName(step.entity)}`
              : step.refused
                ? `Could not read ${recordName(step.entity)}`
                : `Read ${recordName(step.entity)}`}
          </li>
        ),
      )}
    </ul>
  );
}

/** The turn in flight — same shape as a landed one, plus the orb and caret. */
export function LiveTurn({ live }: { live: Live }) {
  return (
    <div className="flex flex-col gap-2">
      <Steps steps={live.steps} pending={live.text === ""} />
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

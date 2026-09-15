"use client";

import { Check, CircleSlash } from "lucide-react";
import { AssistantOrb } from "@/components/portal/assistant-orb";
import type { Live, Step } from "@/lib/store/ai2-turn";

/**
 * What the assistant is doing, and the answer as it is written.
 *
 * Shared by both `/ai2` surfaces — the assistant page and the Ask page — so the
 * same turn cannot be narrated in two different vocabularies depending on which
 * screen somebody opened. The phrasing below is the only place the catalogue's
 * entity names are turned into English; see `recordName`.
 */

/**
 * A record's name, as a person would say it.
 *
 * The server sends the catalogue's own `entity` — `leave_request`, `payroll_run`
 * — because that is what the model named, and inventing a label there would put
 * a second vocabulary on the API. Phrasing is a rendering job, so it is here.
 * An unknown name falls through to itself rather than to a guess: a new entity
 * should read a little mechanically, not wrongly.
 */
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
 * What it did, in order.
 *
 * `pending` covers the gap before anything has been reported — the model is
 * deciding whether it needs data at all, which is a real wait with nothing yet
 * to name. Saying "looking through your records" there would be a claim about
 * work that may not happen.
 */
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
            {/* "Could not read" rather than "found nothing": a refusal is a
                permission this account does not hold, and reporting it as an
                empty result is the one mistake the whole module is arranged to
                avoid. The answer itself will say what was needed. */}
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

/**
 * The turn in flight.
 *
 * Deliberately the same shape as a landed one, so nothing jumps when it lands —
 * the only difference is the orb and the caret, which are the honest signal that
 * this is not finished and that the text may still be withdrawn.
 */
export function LiveTurn({ live }: { live: Live }) {
  return (
    <div className="flex flex-col gap-2">
      <Steps steps={live.steps} pending={live.text === ""} />
      {live.text !== "" && (
        <p className="max-w-[44rem] rounded-lg border border-line bg-canvas px-3 py-2 text-body-sm leading-relaxed whitespace-pre-wrap text-ink">
          {live.text}
          {/* A caret, so a pause between deltas reads as still writing rather
              than as an answer that stops mid-sentence. */}
          <span
            aria-hidden="true"
            className="ml-0.5 inline-block h-4 w-px animate-pulse bg-muted align-text-bottom"
          />
        </p>
      )}
    </div>
  );
}

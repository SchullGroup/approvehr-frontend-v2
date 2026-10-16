"use client";

import {
  Download,
  Star,
  StarOff,
  Tag as TagIcon,
  TagsIcon,
  X,
} from "lucide-react";
import { Button, Callout, ProgressMeter } from "@/components/ui";
import { needsAttention, summarise } from "@/lib/hiring/pipeline/bulk";
import type { BulkOutcome, BulkProgress } from "@/lib/hiring/pipeline/model";
import type { BulkSelection } from "@/lib/hiring/pipeline/use-bulk-selection";

/**
 * What can be done to the people who are ticked, and what it did.
 *
 * ## Two sentences it will not get wrong
 *
 * - **How many.** The bar says exactly how many people the next action is for, and
 *   when that is "everyone matching these filters" it says so in those words with
 *   the number — never a count of "this page" that quietly means more.
 * - **Who it did not work for.** After an action a results panel says how many were
 *   done, how many were left as they were, and **lists everyone it refused, with
 *   the API's reason**. A line that said "42 moved" and hid the three who were not
 *   would be a lie by omission about three people's applications.
 *
 * The actions are offered to whoever can manage hiring and nobody else; the
 * screen decides that before it renders this.
 */

export type BulkChoice =
  | "move"
  | "reject"
  | "tag"
  | "untag"
  | "pool-add"
  | "pool-remove"
  | "export"
  | "everyone"
  | "clear";

const ALL_CHOICES: BulkChoice[] = [
  "move",
  "reject",
  "tag",
  "untag",
  "pool-add",
  "pool-remove",
  "export",
  "clear",
];

const BUTTONS: { choice: BulkChoice; label: string; icon?: React.ReactNode }[] =
  [
    { choice: "move", label: "Move to…" },
    { choice: "reject", label: "Reject…" },
    {
      choice: "tag",
      label: "Add a tag…",
      icon: <TagIcon aria-hidden="true" className="size-3.5" />,
    },
    {
      choice: "untag",
      label: "Remove a tag…",
      icon: <TagsIcon aria-hidden="true" className="size-3.5" />,
    },
    {
      choice: "pool-add",
      label: "Keep in talent pool",
      icon: <Star aria-hidden="true" className="size-3.5" />,
    },
    {
      choice: "pool-remove",
      label: "Take out of talent pool",
      icon: <StarOff aria-hidden="true" className="size-3.5" />,
    },
    {
      choice: "export",
      label: "Export CSV",
      icon: <Download aria-hidden="true" className="size-3.5" />,
    },
    {
      choice: "clear",
      label: "Clear",
      icon: <X aria-hidden="true" className="size-3.5" />,
    },
  ];

export function BulkBar({
  selection,
  busy,
  progress,
  offer,
  onChoose,
  choices = ALL_CHOICES,
  labels = {},
}: {
  selection: BulkSelection;
  busy: boolean;
  progress: BulkProgress | null;
  /**
   * An offer to widen the selection to everyone the filters match, shown once
   * the whole of what is on screen is ticked and there is more behind it.
   */
  offer: { count: number; where: string } | null;
  onChoose: (choice: BulkChoice) => void;
  /** Which actions this screen can do. The queue cannot tag: nobody there is a candidate yet. */
  choices?: readonly BulkChoice[];
  /** The screen's own words for an action: the queue advances and declines. */
  labels?: Partial<Record<BulkChoice, string>>;
}) {
  if (selection.size === 0 && !selection.everyone) return null;
  const has = (choice: BulkChoice) => choices.includes(choice);
  const word = (choice: BulkChoice, fallback: string) =>
    labels[choice] ?? fallback;

  const n = selection.size.toLocaleString("en-NG");

  return (
    <div
      role="region"
      aria-label="Actions for the people you have selected"
      className="flex flex-col gap-3 rounded-lg border border-accent-line bg-accent-soft p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <p
          className="mr-1 text-body-sm font-semibold text-ink"
          aria-live="polite"
        >
          {selection.everyone
            ? `All ${n} matching these filters selected`
            : `${n} ${selection.size === 1 ? "person" : "people"} selected`}
        </p>

        {BUTTONS.filter((button) => has(button.choice)).map((button) => (
          <Button
            key={button.choice}
            size="sm"
            variant={button.choice === "clear" ? "ghost" : "secondary"}
            disabled={busy}
            onClick={() => onChoose(button.choice)}
          >
            {button.icon}
            {word(button.choice, button.label)}
          </Button>
        ))}
      </div>

      {offer && !selection.everyone && (
        <p className="text-body-sm text-body">
          Everyone shown {offer.where} is ticked.{" "}
          <button
            type="button"
            className="font-medium text-accent-text underline underline-offset-2 hover:text-ink"
            onClick={() => onChoose("everyone")}
            disabled={busy}
          >
            Select all {offer.count.toLocaleString("en-NG")} matching these
            filters
          </button>
        </p>
      )}

      {selection.everyone && (
        <p className="text-body-sm text-body">
          To leave some out, clear this and tick people instead, or narrow the
          filters first.
        </p>
      )}

      {progress && (
        <ProgressMeter
          label="Working through the list"
          value={progress.done}
          max={Math.max(1, progress.total)}
          valueLabel={`${progress.done.toLocaleString("en-NG")} of ${progress.total.toLocaleString("en-NG")}`}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/** The panel after a bulk action: the count, and everyone who was not done. */
export function BulkResults({
  what,
  outcome,
  onDismiss,
}: {
  /** Past tense: "Moved to Interview", "Rejected", "Tagged Strong CV". */
  what: string;
  outcome: BulkOutcome;
  onDismiss: () => void;
}) {
  const attention = needsAttention(outcome);
  return (
    <Callout
      tone={attention ? "warning" : "success"}
      title={summarise(outcome, what)}
    >
      <div className="flex flex-col gap-3">
        {outcome.emailed !== null && (
          <p>
            {outcome.emailed > 0
              ? `${outcome.emailed.toLocaleString("en-NG")} ${outcome.emailed === 1 ? "email was" : "emails were"} queued to send. Queued is not sent: each one's own status is on the person's record.`
              : (outcome.emailNote ?? "No emails were queued.")}
          </p>
        )}
        {outcome.emailed !== null &&
          outcome.emailed > 0 &&
          outcome.emailNote && <p>{outcome.emailNote}</p>}

        {outcome.refused.length > 0 && (
          <details open={outcome.refused.length <= 5}>
            <summary className="cursor-pointer font-medium text-ink">
              Who could not be done, and why ({outcome.refused.length})
            </summary>
            <ul className="mt-2 flex max-h-56 flex-col gap-1.5 overflow-y-auto">
              {outcome.refused.map((row) => (
                <li key={row.id} className="text-body-sm">
                  <span className="font-medium text-ink">
                    {row.name || "Someone"}
                  </span>
                  : {row.reason}
                </li>
              ))}
            </ul>
          </details>
        )}

        <div>
          <Button variant="secondary" size="sm" onClick={onDismiss}>
            Dismiss
          </Button>
        </div>
      </div>
    </Callout>
  );
}

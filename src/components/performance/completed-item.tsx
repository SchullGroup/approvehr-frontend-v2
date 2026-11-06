"use client";

import Link from "next/link";
import { Checkbox } from "@/components/ui";
import type { Completion } from "@/lib/projects/completions";
import { isPersonalSource, workIssueHref } from "@/lib/projects/objectives";
import { formatDateShort } from "@/lib/time";

/**
 * One finished task, as a fact.
 *
 * Who finished it is the caller's grouping; what this says is the task, the
 * project, the day it was finished, whether that was by its due date, and the
 * objective it is linked to if anybody linked one. There is no grade here and
 * nothing that looks like one: on time and late are the same quiet word, and a
 * task with no link says nothing about links at all.
 */

const LEVEL_WORDS = {
  company: "the company objective",
  department: "the department objective",
  personal: "a personal objective",
} as const;

/** "Linked to X", with the measure, or that the objective has closed. `null` for no link. */
export function linkLine(item: Completion): string | null {
  const o = item.objective;
  if (!o) return null;
  if (o.closed) return "Linked objective is closed";
  const to = o.keyResultTitle ? `${o.title}, ${o.keyResultTitle}` : o.title;
  /* A task linked above the KPI it is listed under says at which level, so the
     person grading the KPI knows the link was made one rung up. */
  return item.linkedAt && item.linkedAt !== "personal"
    ? `Linked to ${to}, ${LEVEL_WORDS[item.linkedAt]}`
    : `Linked to ${to}`;
}

export type ItemSelection = {
  checked: boolean;
  onChange: () => void;
  /** The most that can be chosen at once is already chosen. */
  disabled?: boolean;
};

export function CompletedItem({
  item,
  timeZone,
  selection,
  showPerson = false,
}: {
  item: Completion;
  timeZone: string;
  selection?: ItemSelection;
  /** Name who finished it, for a list that is not already under their name. */
  showPerson?: boolean;
}) {
  const link = linkLine(item);
  const where = isPersonalSource({ key: item.key, projectId: item.projectId })
    ? "Personal"
    : item.projectName;
  const facts: React.ReactNode[] = [
    ...(showPerson ? [item.personName] : []),
    <span key="where" className="min-w-0 break-words">
      {where}
    </span>,
    `Finished ${formatDateShort(item.doneAt, timeZone)}`,
    ...(item.onTime !== null ? [item.onTime ? "On time" : "Late"] : []),
  ];
  return (
    <li className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
      {selection && (
        <Checkbox
          checked={selection.checked}
          disabled={selection.disabled === true && !selection.checked}
          onChange={selection.onChange}
          hiddenLabel={`Select ${item.key} ${item.title}`}
          className="mt-0.5"
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <Link
            href={workIssueHref(item)}
            className="tabular text-body-sm font-medium text-accent hover:underline"
          >
            {item.key}
          </Link>
          <span className="min-w-0 break-words text-body-sm text-ink">
            {item.title}
          </span>
        </p>
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-meta text-muted">
          {facts.map((fact, index) => (
            <span key={index} className="inline-flex items-center gap-1.5">
              {index > 0 && <span aria-hidden="true">·</span>}
              {fact}
            </span>
          ))}
        </p>
        {link && <p className="text-meta text-muted">{link}</p>}
      </div>
    </li>
  );
}

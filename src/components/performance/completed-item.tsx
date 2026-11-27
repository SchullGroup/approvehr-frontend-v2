"use client";

import { Checkbox } from "@/components/ui";
import type { Completion } from "@/lib/projects/completions";
import { isLinked } from "@/lib/projects/types";
import { isPersonalSource, workIssueHref } from "@/lib/projects/objectives";
import { workFacts } from "@/lib/performance/work-in-answers";
import { WorkRow } from "./work-row";

/**
 * One finished task, as a fact.
 *
 * Who finished it is the caller's grouping; what this says is the task, the
 * project, the day it was finished, whether that was by its due date, and the
 * objective it is linked to if anybody linked one. There is no grade here and
 * nothing that looks like one: on time and late are the same quiet word, and a
 * task with no link says nothing about links at all.
 *
 * The row and its line of facts are `WorkRow` and `workFacts`, the same for every
 * list of finished work.
 */

const LEVEL_WORDS = {
  company: "company",
  department: "department",
  personal: "personal",
} as const;

/**
 * "Linked to X (a measure)", or that the objective has closed, in the server's
 * own words. `null` for no link at all, which most tasks do not have and which is
 * never worth a line.
 */
export function linkLine(item: Completion): string | null {
  const o = item.objective;
  if (!isLinked(o)) return null;
  /* A task linked above the KPI it is listed under says at which level, so the
     person grading the KPI knows the link was made one rung up. */
  if (item.linkedAt && item.linkedAt !== "personal" && o.state !== "CLOSED") {
    return `${o.message}, at the ${LEVEL_WORDS[item.linkedAt]} level`;
  }
  return o.message;
}

export type ItemSelection = {
  checked: boolean;
  onChange: () => void;
  /** The most that can be chosen at once is already chosen. */
  disabled?: boolean;
};

/**
 * The quiet facts under one finished task: the project (or "Personal"), the day, on time or late, and
 * who set it when somebody else did. Who finished it only where the list is not already under their
 * name. The same words as every other list of finished work (`workFacts`).
 */
export function completionFacts(
  item: Completion,
  timeZone: string,
  showPerson = false,
): string[] {
  return workFacts(
    {
      person: showPerson ? item.personName : null,
      personal:
        item.personal ||
        isPersonalSource({ key: item.key, projectId: item.projectId }),
      where: item.projectName,
      doneAt: item.doneAt,
      finishedOn: item.doneDay,
      timing: item.onTime === null ? null : item.onTime ? "ON_TIME" : "LATE",
      /* Only when somebody else set it: work somebody asked for reads differently from work the
         person set themselves, and the person's own is the ordinary case and says nothing. */
      setBy: item.setBy ?? null,
    },
    timeZone,
  );
}

export function CompletedItem({
  item,
  timeZone,
  selection,
  showPerson = false,
  extra,
  action,
}: {
  item: Completion;
  timeZone: string;
  selection?: ItemSelection;
  /** Name who finished it, for a list that is not already under their name. */
  showPerson?: boolean;
  /**
   * Something the screen has to say about this row beyond the task itself: today, the person's
   * flag that it is wrong. Drawn last, under the facts; nothing for none.
   */
  extra?: React.ReactNode;
  /** What can be done to the row, after it: today, the person's flag menu. */
  action?: React.ReactNode;
}) {
  return (
    <WorkRow
      itemKey={item.key}
      title={item.title}
      /* Only where the reader may open it: a task off a board they are not on
         is named, not linked to a page that would refuse them. */
      href={item.canOpen === false ? null : workIssueHref(item)}
      facts={completionFacts(item, timeZone, showPerson)}
      link={linkLine(item)}
      before={
        selection ? (
          <Checkbox
            checked={selection.checked}
            disabled={selection.disabled === true && !selection.checked}
            onChange={selection.onChange}
            hiddenLabel={`Select ${item.key} ${item.title}`}
            className="mt-0.5"
          />
        ) : undefined
      }
      action={action}
      extra={extra}
    />
  );
}

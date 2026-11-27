"use client";

import { useState } from "react";
import { Avatar, Button, ProgressMeter, useToast } from "@/components/ui";
import { actionMessage } from "@/lib/use-action";
import type { ApiProgressPerson } from "@/lib/api/performance";

/**
 * A manager's team and where each person's appraisal stands (owner, 24 Nov 2026,
 * simplified 27 Nov): the people, grouped by department where it is known, each
 * with one status word and one button. The same list for the real progress and
 * the mock-up; it knows nothing about where the rows came from.
 *
 * ## What it does not have
 *
 * A manager's own reports are a short, already-scoped list, so there is no
 * filter on it, no card around it and no bar on every row. One thin bar above
 * the list says how many are done, and a row has a bar only while it is in
 * progress, because that is the only status a bar says anything about.
 *
 * Each row says its status once: a status word, and the one button that goes
 * with it (Start, Continue, View). A person who is waiting on their own self
 * review has no button but a quiet "Remind", which is gone once it has been used
 * and says nothing about it: the toast is the answer, and a disabled button that
 * said "Reminded today" was a control that could only refuse.
 */

export type TeamStatus = "done" | "in-progress" | "ready" | "locked";

export type TeamPerson = {
  id: string;
  name: string;
  department?: string | null;
  status: TeamStatus;
  stepsDone: number;
  stepsTotal: number;
  /** Why a locked row is locked, in the API's words. Not drawn: the status says it. */
  lockedReason?: string | null;
};

export const STATUS_WORDS: Record<TeamStatus, string> = {
  done: "Done",
  "in-progress": "In progress",
  ready: "Ready to start",
  locked: "Waiting on their self review",
};

/** The one button a row has, by status. A locked row has none. */
const BUTTON_WORDS: Record<Exclude<TeamStatus, "locked">, string> = {
  done: "View",
  "in-progress": "Continue",
  ready: "Start",
};

/** A person's row from the API's progress, as the list draws it. */
export function personOf(row: ApiProgressPerson): TeamPerson {
  const done = row.steps.filter((step) => step.done).length;
  return {
    id: row.employeeId,
    name: row.employeeName,
    status: row.submitted
      ? "done"
      : row.locked
        ? "locked"
        : done > 0
          ? "in-progress"
          : "ready",
    stepsDone: done,
    stepsTotal: row.steps.length,
    lockedReason: row.lockedReason,
  };
}

/**
 * The people in the groups they are drawn in: by department, in the order the
 * departments are first met, with anybody whose department is not known last.
 * When nobody has a department there is one group with no name, and so no
 * heading, which is what the API's own progress gives (it carries none).
 */
export function groupedByDepartment(
  people: readonly TeamPerson[],
): { department: string | null; people: TeamPerson[] }[] {
  const groups = new Map<string | null, TeamPerson[]>();
  for (const person of people) {
    const key = person.department?.trim() || null;
    groups.set(key, [...(groups.get(key) ?? []), person]);
  }
  const named = [...groups].filter(([key]) => key !== null);
  const unnamed = groups.get(null);
  return [
    ...named.map(([department, list]) => ({ department, people: list })),
    ...(unnamed ? [{ department: null, people: unnamed }] : []),
  ];
}

export function TeamAppraisals({
  people,
  onOpen,
  onNudge,
}: {
  people: TeamPerson[];
  onOpen: (person: TeamPerson) => void;
  /** Remind them; rejects with the API's own refusal. Omit for no Remind. */
  onNudge?: (person: TeamPerson) => Promise<void>;
}) {
  const toast = useToast();
  const [reminded, setReminded] = useState<Set<string>>(new Set());
  const done = people.filter((p) => p.status === "done").length;
  const groups = groupedByDepartment(people);
  /* Headings only once there is a department to name: a single group with no
     name is just the list. */
  const headed = groups.some((group) => group.department !== null);

  const remind = (person: TeamPerson) => {
    if (!onNudge) return;
    void onNudge(person)
      .then(() => {
        setReminded((now) => new Set(now).add(person.id));
        toast.push({
          title: "Reminder sent",
          tone: "success",
          detail: "They are asked to send their self review.",
        });
      })
      .catch((caught: unknown) =>
        toast.push({
          title: "Not sent",
          tone: "danger",
          detail: actionMessage(caught, "the reminder"),
        }),
      );
  };

  return (
    <div className="flex flex-col gap-5">
      {people.length > 1 && (
        <ProgressMeter
          size="sm"
          value={done}
          max={people.length}
          label={`${String(done)} of ${String(people.length)} people done`}
          showValue={false}
        />
      )}

      {groups.map((group) => (
        <section key={group.department ?? "none"} className="flex flex-col">
          {headed && (
            <h3 className="mb-1 text-meta font-medium text-muted">
              {group.department ?? "No department"}
            </h3>
          )}
          <ul className="flex flex-col divide-y divide-line">
            {group.people.map((person) => (
              <li key={person.id} className="flex items-center gap-3 py-3">
                <Avatar name={person.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body-sm font-medium text-ink">
                    {person.name}
                  </p>
                  <p className="text-meta text-muted">
                    {STATUS_WORDS[person.status]}
                  </p>
                  {person.status === "in-progress" && (
                    <div className="mt-1.5 max-w-48">
                      <ProgressMeter
                        size="sm"
                        value={person.stepsDone}
                        max={Math.max(person.stepsTotal, 1)}
                      />
                      <span className="sr-only">
                        {`${String(person.stepsDone)} of ${String(person.stepsTotal)} steps`}
                      </span>
                    </div>
                  )}
                </div>
                {person.status === "locked" ? (
                  onNudge &&
                  !reminded.has(person.id) && (
                    <button
                      type="button"
                      onClick={() => remind(person)}
                      className="shrink-0 text-body-sm font-medium text-accent-text hover:underline"
                    >
                      Remind
                    </button>
                  )
                ) : (
                  <Button
                    size="sm"
                    variant={person.status === "done" ? "secondary" : "accent"}
                    onClick={() => onOpen(person)}
                  >
                    {BUTTON_WORDS[person.status]}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

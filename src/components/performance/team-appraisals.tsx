"use client";

import { useState } from "react";
import { Button, Card, Field, Select, useToast } from "@/components/ui";
import { FilterBar } from "@/components/ui/filter-bar";
import { ProgressMeter } from "@/components/ui/progress";
import { actionMessage } from "@/lib/use-action";
import type { ApiProgressPerson } from "@/lib/api/performance";

/**
 * A manager's team and where each person's appraisal stands (owner, 24 Nov
 * 2026): a bar per person and overall, filters, locked rows that say why with a
 * Nudge, and Start, Continue or View for the rest. The same list for the real
 * progress and the mock-up; it knows nothing about where the rows came from.
 */

export type TeamStatus = "done" | "in-progress" | "ready" | "locked";

export type TeamPerson = {
  id: string;
  name: string;
  department?: string | null;
  status: TeamStatus;
  stepsDone: number;
  stepsTotal: number;
  /** Why a locked row is locked, in the API's words. */
  lockedReason?: string | null;
};

export const STATUS_WORDS: Record<TeamStatus, string> = {
  done: "Done",
  "in-progress": "In progress",
  ready: "Ready to start",
  locked: "Waiting for their self review",
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

export function TeamAppraisals({
  people,
  onOpen,
  onNudge,
}: {
  people: TeamPerson[];
  onOpen: (person: TeamPerson) => void;
  /** Remind them; rejects with the API's own refusal. Omit for no Nudge. */
  onNudge?: (person: TeamPerson) => Promise<void>;
}) {
  const toast = useToast();
  const [department, setDepartment] = useState("");
  const [status, setStatus] = useState<"" | TeamStatus>("");
  const [nudged, setNudged] = useState<Set<string>>(new Set());
  const done = people.filter((p) => p.status === "done").length;
  const departments = [
    ...new Set(people.flatMap((p) => (p.department ? [p.department] : []))),
  ];
  const shown = people.filter(
    (p) =>
      (department === "" || p.department === department) &&
      (status === "" || p.status === status),
  );

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5">
        <ProgressMeter
          value={done}
          max={Math.max(people.length, 1)}
          label={`${String(done)} of ${String(people.length)} people done`}
          showValue={false}
        />
      </Card>
      <FilterBar
        applied={[
          ...(department
            ? [
                {
                  label: "Department",
                  value: department,
                  onClear: () => setDepartment(""),
                },
              ]
            : []),
          ...(status
            ? [
                {
                  label: "Status",
                  value: STATUS_WORDS[status],
                  onClear: () => setStatus(""),
                },
              ]
            : []),
        ]}
        onClearAll={() => {
          setDepartment("");
          setStatus("");
        }}
        count={shown.length}
        noun={["person", "people"]}
      >
        {departments.length > 0 && (
          <Field label="Department">
            <Select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            >
              <option value="">Every department</option>
              {departments.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Status">
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as "" | TeamStatus)}
          >
            <option value="">Any status</option>
            {(Object.keys(STATUS_WORDS) as TeamStatus[]).map((key) => (
              <option key={key} value={key}>
                {STATUS_WORDS[key]}
              </option>
            ))}
          </Select>
        </Field>
      </FilterBar>

      <ul className="flex flex-col gap-3">
        {shown.map((person) => (
          <li
            key={person.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4"
          >
            <div className="min-w-0 flex-1 basis-56">
              <p className="text-body-md font-medium text-ink">{person.name}</p>
              <p className="text-body-sm text-muted">
                {[person.department, STATUS_WORDS[person.status]]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {person.status === "locked" && person.lockedReason && (
                <p className="text-meta text-muted">{person.lockedReason}</p>
              )}
              <ProgressMeter
                className="mt-2"
                value={person.stepsDone}
                max={Math.max(person.stepsTotal, 1)}
                size="sm"
                showValue={false}
                label={`${String(person.stepsDone)} of ${String(person.stepsTotal)} steps`}
              />
            </div>
            {person.status === "locked" ? (
              onNudge && (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={nudged.has(person.id)}
                  onClick={() => {
                    void onNudge(person)
                      .then(() => {
                        setNudged(new Set(nudged).add(person.id));
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
                  }}
                >
                  {nudged.has(person.id) ? "Reminded today" : "Nudge"}
                </Button>
              )
            ) : (
              <Button size="sm" variant="accent" onClick={() => onOpen(person)}>
                {person.status === "done"
                  ? "View"
                  : person.status === "in-progress"
                    ? "Continue"
                    : "Start"}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

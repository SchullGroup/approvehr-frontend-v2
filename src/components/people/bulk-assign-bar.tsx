"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button, Select, useToast } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { employees } from "@/lib/api/endpoints";

/**
 * What to do with the rows somebody has ticked.
 *
 * ## It appears only when something is selected
 *
 * A permanently visible bar with disabled controls is furniture. This is the
 * answer to "I have picked some people, now what", and it has no reason to
 * exist before that.
 *
 * ## Two assignments, and deliberately nothing else
 *
 * Department and office. Not pay, not dates, not status, not archive — each of
 * those is a decision about **one** person and belongs on their record, where
 * the change is visible next to everything else about them. Archiving two
 * hundred employment records from a checkbox is the one this most obviously
 * wants and most obviously should not have: an employment record is a legal
 * document, and a mass irreversible act deserves more thought than a tick.
 *
 * ## The sentence afterwards counts what MOVED
 *
 * The API returns `moved` and `alreadyThere` separately, and both are said.
 * "40 people moved" when 37 were already in Finance is the count-true-of-the-
 * wrong-noun defect this codebase has now fixed three times.
 */
export function BulkAssignBar({
  ids,
  departments,
  locations,
  onDone,
  onClear,
}: {
  ids: readonly string[];
  departments: { id: string; name: string }[];
  locations: { id: string; name: string }[];
  /** Called after a successful write, so the table re-reads. */
  onDone: () => void;
  onClear: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  if (ids.length === 0) return null;

  const assign = async (change: {
    departmentId?: string;
    workLocationId?: string;
  }) => {
    setBusy(true);
    try {
      const result = await employees.bulkAssign({
        employeeIds: [...ids],
        ...change,
      });
      toast.push({
        title:
          result.moved === 0
            ? "Nobody moved"
            : `${String(result.moved)} ${result.moved === 1 ? "person" : "people"} moved`,
        /* Said rather than folded into the headline: somebody who ticked forty
           rows and moved three needs to know the other thirty-seven were
           already there, not wonder what failed. */
        ...(result.alreadyThere > 0
          ? {
              detail: `${String(result.alreadyThere)} ${
                result.alreadyThere === 1 ? "was" : "were"
              } already there.`,
            }
          : {}),
        tone: result.moved === 0 ? "info" : "success",
      });
      onDone();
      onClear();
    } catch (caught) {
      toast.push({
        title: "Nobody was moved",
        /* The server's own sentence — which person could not be found, or which
           department does not exist. Nothing here knows. */
        detail:
          caught instanceof ApiError
            ? caught.message
            : "Something went wrong. Try again.",
        tone: "danger",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-accent-line bg-accent-soft px-4 py-3">
      <span className="text-body-sm font-medium text-ink">
        {ids.length} selected
      </span>

      <Select
        aria-label="Move the selected people to a department"
        disabled={busy}
        value=""
        onChange={(event) => {
          const departmentId = event.target.value;
          if (departmentId) void assign({ departmentId });
        }}
      >
        <option value="">Move to a department…</option>
        {departments.map((department) => (
          <option key={department.id} value={department.id}>
            {department.name}
          </option>
        ))}
      </Select>

      <Select
        aria-label="Move the selected people to an office"
        disabled={busy}
        value=""
        onChange={(event) => {
          const workLocationId = event.target.value;
          if (workLocationId) void assign({ workLocationId });
        }}
      >
        <option value="">Move to an office…</option>
        {locations.map((location) => (
          <option key={location.id} value={location.id}>
            {location.name}
          </option>
        ))}
      </Select>

      <Button variant="ghost" size="sm" onClick={onClear} disabled={busy}>
        <X aria-hidden="true" className="size-3.5" />
        Clear
      </Button>
    </div>
  );
}

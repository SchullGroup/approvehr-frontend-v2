"use client";

import { useId, useMemo } from "react";
import { objectiveGroups } from "@/lib/projects/objectives";
import { useKpis } from "@/lib/store/performance";
import { useProjectActor } from "@/lib/store/project-session";
import { ObjectivePicker } from "./objective-picker";

/**
 * "Objective (optional)" on a new task: the objective it counts towards, grouped
 * by level and searched in the picker's own list. Nothing is drawn when there is
 * nothing to choose from (no agreed objective the person may link to): a lone
 * "No link" is not a choice. The same grouping as the task drawer's link.
 */
export function ObjectiveField({
  value,
  assigneeId,
  onChange,
}: {
  value: string;
  assigneeId: string | null;
  onChange: (goalId: string) => void;
}) {
  const id = useId();
  const { employeeId: meId } = useProjectActor();
  const { goals, loading, error } = useKpis("company");
  const groups = useMemo(
    () => objectiveGroups(goals, { meId, assigneeId }),
    [goals, meId, assigneeId],
  );
  if (!loading && !error && groups.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-body-sm font-medium text-ink">
        Objective <span className="font-normal text-muted">(optional)</span>
      </label>
      <ObjectivePicker
        id={id}
        groups={groups}
        value={value || null}
        loading={loading}
        onChange={(next) => onChange(next ?? "")}
      />
    </div>
  );
}

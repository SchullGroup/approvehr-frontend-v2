"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button, IconButton, Input, Select, useToast } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useProject } from "@/components/projects/project-context";
import {
  CATEGORY_LABEL,
  STATUS_CATEGORIES,
  type StatusCategory,
  type StatusInput,
} from "@/lib/projects/types";
import {
  removalBlocker,
  sortStatuses,
  workflowProblem,
} from "@/lib/projects/workflow";

/**
 * The workflow: the board's columns, in order.
 *
 * Edited as a draft and saved as a whole, because the rules — at least two
 * statuses, at least one Done, none removed while it holds issues — are about the
 * list rather than any one row, and a half-saved list is a board with the wrong
 * columns. Each row's category decides whether an issue in it counts as done; its
 * WIP limit only colours the column count, nothing is blocked.
 *
 * A status that holds issues cannot be removed, and the reason is written next to
 * the disabled button rather than hidden in a tooltip: "3 issues are in Done.
 * Move them to another status first."
 */

type Row = {
  /** Stable across edits, so React keeps the right input focused. */
  key: string;
  id: string | undefined;
  name: string;
  category: StatusCategory;
  wip: string;
};

let rowSeed = 0;
const newKey = () => `new-${(rowSeed += 1)}`;

function fromSaved(statuses: ReturnType<typeof sortStatuses>): Row[] {
  return statuses.map((s) => ({
    key: s.id,
    id: s.id,
    name: s.name,
    category: s.category,
    wip: s.wipLimit === null ? "" : String(s.wipLimit),
  }));
}

function toInputs(rows: readonly Row[]): StatusInput[] {
  return rows.map((row) => {
    const wip = row.wip.trim() === "" ? null : Number(row.wip);
    return {
      ...(row.id ? { id: row.id } : {}),
      name: row.name.trim(),
      category: row.category,
      wipLimit: wip,
    };
  });
}

export function WorkflowEditor({ editable }: { editable: boolean }) {
  const { project, issues, actions } = useProject();
  const toast = useToast();
  const saved = sortStatuses(project.statuses);
  /* `null` until something is edited: the editor shows the saved workflow, and a
     refresh that changes it is not hidden behind a stale copy. */
  const [draft, setDraft] = useState<Row[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  /* The row whose remove button was pressed while it could not be used, and why.
     Said on press rather than printed under every row that holds issues, which
     would be most of them. */
  const [refused, setRefused] = useState<string | null>(null);

  const rows = draft ?? fromSaved(saved);
  const dirty = draft !== null;
  const inputs = toInputs(rows);
  const problem = dirty ? workflowProblem(inputs) : null;

  const change = (next: Row[]) => {
    setDraft(next);
    setFailure(null);
    setRefused(null);
  };
  const update = (key: string, patch: Partial<Row>) =>
    change(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const move = (index: number, by: -1 | 1) => {
    const target = index + by;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target]!, next[index]!];
    change(next);
  };
  const remove = (key: string) => change(rows.filter((r) => r.key !== key));
  const add = () => {
    /* Before the last column, so a new status lands between the work and Done. */
    const next = [...rows];
    next.splice(Math.max(0, next.length - 1), 0, {
      key: newKey(),
      id: undefined,
      name: "",
      category: "IN_PROGRESS",
      wip: "",
    });
    change(next);
  };

  /** Why a saved status cannot go, judged against the saved list and issues. */
  const blocker = (row: Row): string | null => {
    if (!row.id) {
      return rows.length <= 2 ? "A workflow needs at least 2 statuses." : null;
    }
    const fromSavedList = removalBlocker(saved, issues, row.id);
    if (fromSavedList) return fromSavedList;
    /* The draft may already have shrunk below the minimum or lost its last Done. */
    if (rows.length <= 2) return "A workflow needs at least 2 statuses.";
    const others = rows.filter((r) => r.key !== row.key);
    if (!others.some((r) => r.category === "DONE")) {
      return "Keep at least one Done status.";
    }
    return null;
  };

  async function save() {
    if (problem) return;
    setSaving(true);
    setFailure(null);
    const result = await actions.saveWorkflow(inputs, { quiet: true });
    setSaving(false);
    if (!result.ok) {
      setFailure(result.message);
      return;
    }
    setDraft(null);
    toast.push({ tone: "success", title: "Workflow saved" });
  }

  return (
    <div>
      <ul className="divide-y divide-line">
        {rows.map((row, index) => {
          const why = editable ? blocker(row) : null;
          const reasonId = `status-${row.key}-reason`;
          const showReason = why !== null && refused === row.key;
          return (
            <li key={row.key} className="py-3">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2 sm:grid-cols-[minmax(0,1fr)_9.5rem_6rem_auto]">
                <Input
                  aria-label={`Status ${index + 1} name`}
                  value={row.name}
                  disabled={!editable}
                  placeholder="Status name"
                  maxLength={40}
                  onChange={(e) => update(row.key, { name: e.target.value })}
                  className="col-span-2 sm:col-span-1"
                />
                <Select
                  aria-label={`Status ${index + 1} category`}
                  value={row.category}
                  disabled={!editable}
                  onChange={(e) =>
                    update(row.key, {
                      category: e.target.value as StatusCategory,
                    })
                  }
                >
                  {STATUS_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {CATEGORY_LABEL[category]}
                    </option>
                  ))}
                </Select>
                <Input
                  aria-label={`Status ${index + 1} WIP limit`}
                  type="number"
                  min={1}
                  step={1}
                  inputMode="numeric"
                  value={row.wip}
                  disabled={!editable}
                  placeholder="No limit"
                  onChange={(e) => update(row.key, { wip: e.target.value })}
                />
                {editable && (
                  <span className="flex items-center gap-0.5 justify-self-end">
                    <IconButton
                      label={`Move ${row.name || "this status"} up`}
                      size="sm"
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUp className="size-4" />
                    </IconButton>
                    <IconButton
                      label={`Move ${row.name || "this status"} down`}
                      size="sm"
                      disabled={index === rows.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown className="size-4" />
                    </IconButton>
                    <IconButton
                      label={`Remove ${row.name || "this status"}`}
                      size="sm"
                      aria-disabled={why !== null}
                      aria-describedby={showReason ? reasonId : undefined}
                      className={cn(why !== null && "opacity-50")}
                      onClick={() => {
                        if (why !== null) setRefused(row.key);
                        else remove(row.key);
                      }}
                    >
                      <Trash2 className="size-4" />
                    </IconButton>
                  </span>
                )}
              </div>
              {showReason && (
                <p
                  id={reasonId}
                  role="status"
                  className="mt-1.5 text-meta text-danger-text sm:max-w-[75%]"
                >
                  {why}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {editable && (
        <div className="mt-2 space-y-3 border-t border-line pt-4">
          {(problem ?? failure) && (
            <p role="alert" className="text-body-sm text-danger-text">
              {problem ?? failure}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={add}>
              <Plus aria-hidden="true" className="size-4" />
              Add a status
            </Button>
            <span className="flex-1" />
            {dirty && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setDraft(null);
                  setFailure(null);
                }}
              >
                Discard changes
              </Button>
            )}
            <Button
              size="sm"
              variant="primary"
              loading={saving}
              disabled={!dirty || problem !== null}
              onClick={() => void save()}
            >
              Save workflow
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

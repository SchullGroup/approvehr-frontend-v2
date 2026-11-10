/**
 * The filters on a list of work, kept in the address bar.
 *
 * A tile on an overview ("Overdue 42") opens the list it counts by naming the
 * same bucket in the address (`?view=tasks&bucket=overdue`), so a link is
 * shareable and the back button undoes a filter. This file turns the address into
 * the query the API (and the demo's engine) answers, and back.
 *
 * Pure: no React, no clock.
 */

import { STATUS_CATEGORIES, type StatusCategory } from "./types";
import {
  ARCHIVE_REASONS,
  WORK_BUCKETS,
  type ArchiveReason,
  type WorkBucket,
  type WorkQuery,
} from "./programs";

/** The words in the address, one per filter. */
export const WORK_PARAMS = [
  "program",
  "project",
  "assignee",
  "stage",
  "stageName",
  "bucket",
  "q",
  /* The Archive's "Why": project, program or done. */
  "why",
] as const;

export type WorkParam = (typeof WORK_PARAMS)[number];

/** What the "Due" filter offers, in order. The values are the API's bucket words. */
export const DUE_CHOICES: { value: WorkBucket | ""; label: string }[] = [
  { value: "", label: "Any" },
  { value: "overdue", label: "Overdue" },
  { value: "dueThisWeek", label: "Due this week" },
  { value: "open", label: "Not finished" },
  { value: "doneThisWeek", label: "Done this week" },
];

const isCategory = (v: string): v is StatusCategory =>
  (STATUS_CATEGORIES as readonly string[]).includes(v);
const isBucket = (v: string): v is WorkBucket =>
  (WORK_BUCKETS as readonly string[]).includes(v);
const isReason = (v: string): v is ArchiveReason =>
  (ARCHIVE_REASONS as readonly string[]).includes(v);

/** Everything the address says, as it says it. Unknown words are dropped, not guessed at. */
export function queryFromParams(
  params: URLSearchParams,
  fixed: Pick<WorkQuery, "programId" | "unassigned"> = {},
): WorkQuery {
  const stage = params.get("stage")?.toUpperCase() ?? "";
  const bucket = params.get("bucket") ?? "";
  const program = params.get("program") ?? "";
  const project = params.get("project") ?? "";
  const assignee = params.get("assignee") ?? "";
  const q = params.get("q") ?? "";
  const why = params.get("why") ?? "";
  /* One of the projects' own stages by name ("In review"). `stage` stays the
     category word, so links made before names could be picked still work. */
  const stageName = (params.get("stageName") ?? "").trim();
  return {
    ...fixed,
    ...(!fixed.programId && !fixed.unassigned && program
      ? { programId: program }
      : {}),
    ...(project ? { projectId: project } : {}),
    ...(assignee ? { assigneeId: assignee } : {}),
    ...(isCategory(stage) ? { category: [stage] } : {}),
    ...(stageName ? { stage: [stageName] } : {}),
    ...(isBucket(bucket) ? { bucket } : {}),
    ...(q.trim() ? { q: q.trim() } : {}),
    ...(isReason(why) ? { reason: why } : {}),
  };
}

/** How many filters (beyond the fixed scope) are narrowing the list. */
export function filterCount(params: URLSearchParams): number {
  return WORK_PARAMS.filter((name) => (params.get(name) ?? "") !== "").length;
}

/** The address with one filter changed. `view` and anything else stay. */
export function withParam(
  params: URLSearchParams,
  name: WorkParam,
  value: string | null,
): URLSearchParams {
  const next = new URLSearchParams(params.toString());
  if (value === null || value === "") next.delete(name);
  else next.set(name, value);
  return next;
}

export function withoutFilters(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params.toString());
  for (const name of WORK_PARAMS) next.delete(name);
  return next;
}

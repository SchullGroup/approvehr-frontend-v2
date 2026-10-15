/**
 * An issue's history, in words.
 *
 * The API writes one row per changed field (never rank); `created` and
 * `description` rows carry no values, because a description can be long and the
 * row only needs to say it changed. This turns a row into the sentence the drawer
 * shows, resolving ids to the names people know them by.
 */

import {
  ISSUE_TYPE_LABEL,
  PRIORITY_LABEL,
  type IssueActivity,
  type IssueType,
  type Priority,
} from "./types";
import { shortDate } from "@/lib/today";

export type HistoryLookup = {
  statusName: (id: string) => string | null;
  personName: (id: string) => string;
  sprintName: (id: string) => string | null;
  issueKey: (id: string) => string | null;
};

const FIELD_LABEL: Record<string, string> = {
  statusId: "status",
  assigneeId: "assignee",
  priority: "priority",
  points: "story points",
  sprintId: "sprint",
  epicId: "epic",
  parentId: "parent",
  title: "title",
  type: "type",
  labels: "labels",
  startDate: "start date",
  dueDate: "due date",
  goalId: "objective",
};

export type ActivityText = {
  /** Follows the actor's name: "created the issue", "changed status". */
  verb: string;
  from: string | null;
  to: string | null;
};

const NONE = "none";

function asText(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

export function formatValue(
  field: string,
  value: unknown,
  lookup: HistoryLookup,
): string {
  if (field === "labels") {
    const list = Array.isArray(value) ? (value as string[]) : [];
    return list.length > 0 ? list.join(", ") : NONE;
  }
  const text = asText(value);
  if (text === null) return NONE;
  switch (field) {
    case "statusId":
      return lookup.statusName(text) ?? "a status that has been removed";
    case "assigneeId":
      return lookup.personName(text);
    case "sprintId":
      return lookup.sprintName(text) ?? "a sprint";
    case "epicId":
    case "parentId":
      return lookup.issueKey(text) ?? "an issue";
    case "priority":
      return PRIORITY_LABEL[text as Priority] ?? text;
    case "type":
      return ISSUE_TYPE_LABEL[text as IssueType] ?? text;
    case "startDate":
    case "dueDate":
      return shortDate(text);
    default:
      return text;
  }
}

export function describeActivity(
  activity: Pick<IssueActivity, "field" | "from" | "to">,
  lookup: HistoryLookup,
): ActivityText {
  if (activity.field === "created") {
    return { verb: "created the issue", from: null, to: null };
  }
  if (activity.field === "description") {
    return { verb: "updated the description", from: null, to: null };
  }
  const label = FIELD_LABEL[activity.field] ?? activity.field;
  if (activity.field === "title") {
    return { verb: "changed the title", from: null, to: null };
  }
  return {
    verb: `changed ${label}`,
    from: formatValue(activity.field, activity.from, lookup),
    to: formatValue(activity.field, activity.to, lookup),
  };
}

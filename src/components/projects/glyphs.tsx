import {
  Bookmark,
  Bug,
  ChevronDown,
  ChevronUp,
  ChevronsDown,
  ChevronsUp,
  Equal,
  ListTree,
  SquareCheck,
  Zap,
} from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  CATEGORY_LABEL,
  ISSUE_TYPE_LABEL,
  PRIORITY_LABEL,
  type IssueType,
  type Priority,
  type Project,
  type ProjectStatus,
  type StatusCategory,
} from "@/lib/projects/types";

/**
 * The small marks every Projects view shares: an issue's type, its priority, its
 * status, its key, its points, its labels.
 *
 * Each one says what it is in words as well as colour — the type and priority
 * icons carry a label and a tooltip, never a colour alone — because a board read
 * across a room, or by somebody who does not see red and green apart, must still
 * be readable. Sizes stay at or above the 14px floor wherever there is text.
 */

const TYPE_ICON: Record<IssueType, typeof Zap> = {
  EPIC: Zap,
  STORY: Bookmark,
  TASK: SquareCheck,
  BUG: Bug,
  SUBTASK: ListTree,
};

/* A tinted tile with a coloured glyph rather than a white glyph on a solid fill:
   it holds up in dark mode, where the category colours lighten and white on
   them would not. */
const TYPE_TONE: Record<IssueType, string> = {
  EPIC: "bg-cat-4/15 text-cat-4",
  STORY: "bg-success-soft text-success-text",
  TASK: "bg-info-soft text-info-text",
  BUG: "bg-danger-soft text-danger-text",
  SUBTASK: "bg-sunken text-muted",
};

export function TypeIcon({
  type,
  className,
}: {
  type: IssueType;
  className?: string;
}) {
  const Icon = TYPE_ICON[type];
  return (
    <span
      role="img"
      aria-label={ISSUE_TYPE_LABEL[type]}
      title={ISSUE_TYPE_LABEL[type]}
      className={cn(
        "inline-flex size-5 shrink-0 items-center justify-center rounded-sm",
        TYPE_TONE[type],
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-3" strokeWidth={2.4} />
    </span>
  );
}

const PRIORITY_ICON: Record<Priority, typeof Zap> = {
  HIGHEST: ChevronsUp,
  HIGH: ChevronUp,
  MEDIUM: Equal,
  LOW: ChevronDown,
  LOWEST: ChevronsDown,
};

const PRIORITY_TONE: Record<Priority, string> = {
  HIGHEST: "text-danger-text",
  HIGH: "text-danger-text",
  MEDIUM: "text-warning-text",
  LOW: "text-info-text",
  LOWEST: "text-info-text",
};

export function PriorityIcon({
  priority,
  className,
}: {
  priority: Priority;
  className?: string;
}) {
  const Icon = PRIORITY_ICON[priority];
  return (
    <span
      role="img"
      aria-label={`${PRIORITY_LABEL[priority]} priority`}
      title={`${PRIORITY_LABEL[priority]} priority`}
      className={cn("inline-flex shrink-0", PRIORITY_TONE[priority], className)}
    >
      <Icon aria-hidden="true" className="size-4" strokeWidth={2.4} />
    </span>
  );
}

const CATEGORY_TONE: Record<StatusCategory, BadgeTone> = {
  TODO: "neutral",
  IN_PROGRESS: "accent",
  DONE: "success",
};

export function categoryTone(category: StatusCategory): BadgeTone {
  return CATEGORY_TONE[category];
}

export function StatusPill({
  status,
  className,
}: {
  status: Pick<ProjectStatus, "name" | "category">;
  className?: string;
}) {
  return (
    <Badge
      tone={CATEGORY_TONE[status.category]}
      size="sm"
      className={className}
      title={CATEGORY_LABEL[status.category]}
    >
      {status.name}
    </Badge>
  );
}

/** The issue key, struck through once the issue is done. */
export function IssueKey({
  issueKey,
  done = false,
  className,
}: {
  issueKey: string;
  done?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "tabular whitespace-nowrap text-meta font-medium text-muted",
        done && "line-through",
        className,
      )}
    >
      {issueKey}
    </span>
  );
}

export function PointsPill({
  points,
  className,
}: {
  points: number;
  className?: string;
}) {
  return (
    <span
      title={`${points} ${points === 1 ? "point" : "points"}`}
      className={cn(
        "tabular inline-flex min-w-6 shrink-0 items-center justify-center rounded-full bg-sunken px-1.5 text-meta font-semibold text-body",
        className,
      )}
    >
      {points}
    </span>
  );
}

export function LabelChip({ label }: { label: string }) {
  return (
    <span className="inline-flex max-w-[9rem] items-center truncate rounded-sm border border-line px-1.5 text-meta text-muted">
      {label}
    </span>
  );
}

export function EpicChip({ title }: { title: string }) {
  return (
    <span
      title={title}
      className="inline-flex max-w-[11rem] items-center gap-1 rounded-sm bg-cat-4/12 px-1.5 py-0.5 text-meta font-medium text-ink"
    >
      <Zap aria-hidden="true" className="size-3 shrink-0 text-cat-4" />
      <span className="truncate">{title}</span>
    </span>
  );
}

/** The project's coloured key, white on a dark hue. */
export function ProjectKeyChip({
  project,
  className,
}: {
  project: Pick<Project, "key" | "color">;
  className?: string;
}) {
  return (
    <span
      style={{ backgroundColor: project.color }}
      className={cn(
        "tabular inline-flex h-6 min-w-9 shrink-0 items-center justify-center rounded-sm px-1.5 text-meta font-semibold text-white",
        className,
      )}
    >
      {project.key}
    </span>
  );
}

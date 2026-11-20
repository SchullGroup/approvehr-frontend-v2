"use client";

import { ArrowRight, Check, CircleDashed, TriangleAlert } from "lucide-react";
import { Badge, ButtonLink, type BadgeTone } from "@/components/ui";
import type { ChecklistRow, RowStatus } from "./checklist";

/**
 * One row of the setup checklist.
 *
 * Shared by the setup page (`/settings/setup`) and the settings search, which
 * lists the rows that match a word. Kept in one place so the two cannot drift
 * into describing the same row differently.
 */

export const STATUS: Record<
  RowStatus,
  { label: string; tone: BadgeTone; icon: React.ReactNode }
> = {
  done: {
    label: "Done",
    tone: "success",
    icon: <Check aria-hidden="true" className="size-4" />,
  },
  attention: {
    label: "Needs attention",
    tone: "warning",
    icon: <TriangleAlert aria-hidden="true" className="size-4" />,
  },
  todo: {
    label: "Not set up",
    tone: "danger",
    icon: <CircleDashed aria-hidden="true" className="size-4" />,
  },
  optional: {
    label: "Your choice",
    tone: "neutral",
    icon: <CircleDashed aria-hidden="true" className="size-4" />,
  },
  unknown: {
    label: "Not known offline",
    tone: "neutral",
    icon: <CircleDashed aria-hidden="true" className="size-4" />,
  },
};

export function Row({ row, module }: { row: ChecklistRow; module?: string }) {
  const status = STATUS[row.status];
  return (
    <li className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:gap-5">
      <span
        aria-hidden="true"
        className={
          row.status === "done"
            ? "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-success-soft text-success-text"
            : row.status === "attention"
              ? "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning-text"
              : row.status === "todo"
                ? "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning-text"
                : "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-canvas text-faint"
        }
      >
        {status.icon}
      </span>

      <span className="min-w-0 flex-1">
        {module && (
          <span className="block text-meta font-semibold text-muted">
            {module}
          </span>
        )}
        <span className="flex flex-wrap items-center gap-2">
          <h3 className="text-body-sm font-semibold text-ink">{row.title}</h3>
          <Badge tone={status.tone} size="sm">
            {status.label}
          </Badge>
        </span>
        <p className="mt-1 text-body-sm text-body">{row.detail}</p>
        <p className="mt-1 text-meta text-muted">{row.affects}</p>
      </span>

      <span className="flex shrink-0 flex-wrap items-center gap-2">
        {row.also && (
          <ButtonLink href={row.also.href} variant="ghost" size="sm">
            {row.also.label}
          </ButtonLink>
        )}
        <ButtonLink
          href={row.href}
          variant={
            row.status === "done" || row.status === "optional"
              ? "secondary"
              : "accent"
          }
          size="sm"
        >
          {row.linkLabel}
          <ArrowRight aria-hidden="true" className="size-3.5" />
        </ButtonLink>
      </span>
    </li>
  );
}

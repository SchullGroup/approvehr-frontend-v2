"use client";

import { FileText, ShieldCheck } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  CATEGORY_LABEL,
  type ApiDocument,
  type ApiDocumentRequest,
} from "@/lib/api/documents";
import { dueLabel } from "@/lib/store/documents";

/**
 * The two rows every documents screen is built from.
 *
 * One for a document on file, one for a request nobody has answered. Written
 * once and shared by the HR register, the per-person drawer and the employee's
 * own screen, so a document cannot look like one thing to HR and another to the
 * person it belongs to.
 *
 * Each takes its buttons as a prop rather than deciding them, because who is
 * looking changes what can be done — HR can drop a request, the employee
 * cannot — and that decision belongs to the screen with the permission check
 * in it.
 */

/** `2022-03-14T…` → `14 Mar 2022`. A contract from four years ago needs its year. */
export function readableDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${date.getUTCDate()} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** Late is danger, this week is warning, later is neutral. Colour never carries it alone. */
export function DueChip({
  daysLeft,
  overdue,
}: {
  daysLeft: number | null;
  overdue: boolean;
}) {
  const tone: BadgeTone = overdue
    ? "danger"
    : daysLeft !== null && daysLeft <= 7
      ? "warning"
      : "neutral";
  return (
    <Badge tone={tone} size="sm">
      {dueLabel(daysLeft)}
    </Badge>
  );
}

export function StatusChip({ request }: { request: ApiDocumentRequest }) {
  if (request.status === "FULFILLED") {
    return (
      <Badge tone="success" size="sm">
        Received
      </Badge>
    );
  }
  if (request.status === "WAIVED") {
    return (
      <Badge tone="neutral" size="sm">
        Dropped
      </Badge>
    );
  }
  return <DueChip daysLeft={request.daysLeft} overdue={request.overdue} />;
}

/* -------------------------------------------------------------------------- */

export function RequestRow({
  request,
  /** Shown above the name when the row is not already inside one person's file. */
  showPerson = false,
  actions,
}: {
  request: ApiDocumentRequest;
  showPerson?: boolean;
  actions?: React.ReactNode;
}) {
  const secondary = [
    request.status === "WAIVED" && request.waivedReason
      ? `Dropped: ${request.waivedReason}`
      : null,
    request.status === "FULFILLED" && request.fulfilledAt
      ? `Received ${readableDate(request.fulfilledAt)}`
      : null,
    request.status === "OPEN" ? request.reason : null,
    request.status === "OPEN" && request.requestedByName
      ? `Asked by ${request.requestedByName}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-md border p-3",
        request.overdue ? "border-danger-line bg-danger-soft/40" : "border-line",
      )}
    >
      <div className="min-w-0 flex-1">
        {showPerson && (
          <p className="text-[0.75rem] text-muted">
            {request.employeeName} · {request.employeeNo}
          </p>
        )}
        <p className="flex flex-wrap items-center gap-2 text-[0.9375rem] font-medium text-ink">
          {request.name}
          <Badge tone="neutral" size="sm">
            {CATEGORY_LABEL[request.category]}
          </Badge>
          <StatusChip request={request} />
        </p>
        {secondary && (
          <p className="mt-0.5 text-[0.875rem] text-muted">{secondary}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-1.5">{actions}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

export function DocumentRow({
  document,
  action,
}: {
  document: ApiDocument;
  action?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-md border border-line p-3",
        document.archived && "opacity-60",
      )}
    >
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sunken text-muted [&>svg]:size-4"
      >
        <FileText />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-[0.9375rem] font-medium text-ink">
          {document.name}
          <Badge tone="neutral" size="sm">
            {CATEGORY_LABEL[document.category]}
          </Badge>
          {document.verified && (
            <Badge tone="success" size="sm" icon={<ShieldCheck aria-hidden="true" />}>
              Checked
            </Badge>
          )}
          {document.fulfilsRequestId !== null && (
            <Badge tone="accent" size="sm">
              Answers a request
            </Badge>
          )}
          {document.archived && (
            <Badge tone="neutral" size="sm">
              Past
            </Badge>
          )}
        </p>
        {/* The key, because it is all there is. Nothing here offers a download:
            there is no file endpoint yet, and a dead link is worse than a path
            somebody can go and look up. */}
        <p className="mt-0.5 truncate text-[0.875rem] text-muted">
          Added {readableDate(document.uploadedAt)} · kept at{" "}
          <span className="tabular text-[0.75rem]">{document.storageKey}</span>
        </p>
      </div>
      {action && <div className="flex shrink-0 gap-1.5">{action}</div>}
    </div>
  );
}

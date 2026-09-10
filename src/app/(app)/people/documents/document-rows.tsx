"use client";

import { useState } from "react";
import { Download, FileText, ShieldCheck } from "lucide-react";
import { Badge, Button, type BadgeTone } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  CATEGORY_LABEL,
  type ApiDocument,
  type ApiDocumentRequest,
} from "@/lib/api/documents";
import { dueLabel } from "@/lib/store/documents";
import { documentFile, saveDocument } from "@/lib/api/uploads";

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
        request.overdue
          ? "border-danger-line bg-danger-soft/40"
          : "border-line",
      )}
    >
      <div className="min-w-0 flex-1">
        {showPerson && (
          <p className="text-meta text-muted">
            {request.employeeName} · {request.employeeNo}
          </p>
        )}
        <p className="flex flex-wrap items-center gap-2 text-body-sm font-medium text-ink">
          {request.name}
          <Badge tone="neutral" size="sm">
            {CATEGORY_LABEL[request.category]}
          </Badge>
          <StatusChip request={request} />
        </p>
        {secondary && (
          <p className="mt-0.5 text-body-sm text-muted">{secondary}</p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap gap-1.5">{actions}</div>
      )}
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
        <p className="flex flex-wrap items-center gap-2 text-body-sm font-medium text-ink">
          {document.name}
          <Badge tone="neutral" size="sm">
            {CATEGORY_LABEL[document.category]}
          </Badge>
          {document.verified && (
            <Badge
              tone="success"
              size="sm"
              icon={<ShieldCheck aria-hidden="true" />}
            >
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
        {/* The date, and a way to open it. The key used to be printed here
            because it was all there was; a reader has no use for a storage
            path once the file behind it can actually be fetched. */}
        <p className="mt-0.5 truncate text-body-sm text-muted">
          Added {readableDate(document.uploadedAt)}
        </p>
        <OpenDocument
          id={document.id}
          name={document.name}
          hasFile={document.hasFile}
        />
      </div>
      {action && <div className="flex shrink-0 gap-1.5">{action}</div>}
    </div>
  );
}

/**
 * Open one document.
 *
 * Nothing happens until the press, for two reasons that both still hold: a
 * presigned URL is a bearer token for that file and expires in minutes, so one
 * issued when a list rendered would be dead before anybody scrolled to it — and
 * every read is **audited** on the API, so a page of twenty documents would
 * otherwise write twenty download entries for a page nobody read.
 *
 * ## Two kinds of file
 *
 * A document held in the database is fetched **with the caller's token** and
 * handed to the browser as a download. There is no link to open, and
 * deliberately no signed one: a credential-free URL to somebody's passport is
 * forwardable to anybody. One in a bucket still opens its presigned URL.
 * `source` on the API's answer says which, so this does not guess.
 *
 * When there is nothing behind the row the API says so in its own sentence, and
 * that is shown rather than a dead link.
 */
function OpenDocument({
  id,
  name,
  hasFile,
}: {
  id: string;
  name: string;
  hasFile: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  return (
    <div className="mt-1 flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setNote(null);
          /* `hasFile` short-circuits the round trip for a row that has no file
             — the answer is already known, and asking would write an audit
             entry for a download that cannot happen. */
          const open = hasFile
            ? saveDocument(id, name)
            : documentFile(id).then((access) => {
                if (access.source === "inline") return saveDocument(id, name);
                if (access.url) {
                  /* `noopener` because the target is somebody else's origin. */
                  window.open(access.url, "_blank", "noopener,noreferrer");
                  return;
                }
                setNote(access.note ?? "There is nothing to open.");
              });

          void open
            .catch((error: unknown) =>
              setNote(
                error instanceof Error
                  ? error.message
                  : "The file could not be opened.",
              ),
            )
            .finally(() => setBusy(false));
        }}
      >
        <Download aria-hidden="true" className="size-3.5" />
        {busy ? "Opening…" : hasFile ? "Download" : "Open"}
      </Button>
      {note && (
        <span className="text-meta text-muted" role="status">
          {note}
        </span>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import {
  Archive,
  Banknote,
  Check,
  ChevronDown,
  Eye,
  FileUp,
  Pencil,
  Plus,
  RotateCcw,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import {
  Badge,
  DescriptionList,
  Spinner,
  TBody,
  TD,
  TH,
  THead,
  TR,
  TableWrap,
} from "@/components/ui";
import type { AuditEntry, AuditEntryDetail } from "@/lib/api/audit";
import {
  describe,
  formatFieldValue,
  fullStamp,
  prettyField,
  timeLabel,
} from "@/lib/audit/language";
import { useAuditEvent } from "@/lib/store/audit";

/**
 * One row of the trail, and what opening it shows.
 *
 * Shared by the audit screen and by `RecordHistory`, so a change looks the same
 * on the log as it does on the record it happened to.
 *
 * ## Why the rail is hand-drawn instead of using `<Timeline>`
 *
 * `components/ui/misc.tsx` has a `Timeline`, and its entries are static: a
 * string title and an optional detail node, no disclosure. These rows have to
 * be buttons — the values live behind a second request, and that request is
 * *itself recorded*, so opening one has to be a deliberate act rather than
 * something the page does for twenty-five rows on load. The rail below copies
 * `Timeline`'s measurements exactly (the 6px dot, the 4px `surface` ring, the
 * hairline at `left-[11px]`) so the two read as the same component.
 *
 * ## The row is four facts and no more
 *
 * The sentence, when it happened, what kind of record it was, and whether any
 * value was withheld. Everything else — the before and after, the IP address,
 * the browser — is behind the disclosure, because a page of twenty-five rows is
 * something a person scans and a diff is something a person reads.
 */

/* Colour carries the same meaning as the icon, never on its own. */
type Tone = "neutral" | "accent" | "success" | "warning" | "danger";

const DOTS: Record<Tone, string> = {
  neutral: "bg-sunken text-muted",
  accent: "bg-accent-soft text-accent-text",
  success: "bg-success-soft text-success-text",
  warning: "bg-warning-soft text-warning-text",
  danger: "bg-danger-soft text-danger-text",
};

/** Keyed on the verb, for the same reason the sentences are. See `language.ts`. */
const MARKS: Record<string, { tone: Tone; icon: React.ReactNode }> = {
  created: { tone: "accent", icon: <Plus aria-hidden="true" /> },
  added: { tone: "accent", icon: <Plus aria-hidden="true" /> },
  updated: { tone: "accent", icon: <Pencil aria-hidden="true" /> },
  bank_changed: { tone: "warning", icon: <Pencil aria-hidden="true" /> },
  corrected: { tone: "accent", icon: <Pencil aria-hidden="true" /> },
  archived: { tone: "warning", icon: <Archive aria-hidden="true" /> },
  deleted: { tone: "danger", icon: <X aria-hidden="true" /> },
  deactivated: { tone: "warning", icon: <Archive aria-hidden="true" /> },
  restored: { tone: "success", icon: <RotateCcw aria-hidden="true" /> },
  approved: { tone: "success", icon: <Check aria-hidden="true" /> },
  hr_approved: { tone: "success", icon: <Check aria-hidden="true" /> },
  manager_approved: { tone: "success", icon: <Check aria-hidden="true" /> },
  bulk_approved: { tone: "success", icon: <Check aria-hidden="true" /> },
  accepted: { tone: "success", icon: <Check aria-hidden="true" /> },
  acknowledged: { tone: "success", icon: <Check aria-hidden="true" /> },
  declined: { tone: "danger", icon: <X aria-hidden="true" /> },
  rejected: { tone: "danger", icon: <X aria-hidden="true" /> },
  cancelled: { tone: "danger", icon: <X aria-hidden="true" /> },
  paid: { tone: "success", icon: <Banknote aria-hidden="true" /> },
  prepared: { tone: "accent", icon: <Banknote aria-hidden="true" /> },
  repayment_recorded: { tone: "accent", icon: <Banknote aria-hidden="true" /> },
  repayment_waived: { tone: "warning", icon: <Banknote aria-hidden="true" /> },
  increase_applied: { tone: "success", icon: <Banknote aria-hidden="true" /> },
  members_added: { tone: "warning", icon: <Users aria-hidden="true" /> },
  member_removed: { tone: "warning", icon: <Users aria-hidden="true" /> },
  employees_assigned: { tone: "accent", icon: <Users aria-hidden="true" /> },
  employees_unassigned: { tone: "accent", icon: <Users aria-hidden="true" /> },
  applied: { tone: "accent", icon: <FileUp aria-hidden="true" /> },
};

const READ_MARK = { tone: "neutral" as Tone, icon: <Eye aria-hidden="true" /> };
const FALLBACK_MARK = { tone: "neutral" as Tone, icon: <Pencil aria-hidden="true" /> };

function markFor(entry: AuditEntry) {
  if (entry.isRead) return READ_MARK;
  const verb = entry.action.includes(".")
    ? entry.action.slice(entry.action.indexOf(".") + 1)
    : entry.action;
  return MARKS[verb] ?? FALLBACK_MARK;
}

/* -------------------------------------------------------------------- row */

export function TrailEntry({
  entry,
  now,
  /** Draws the hairline down to the next row. False on the last one. */
  rail = true,
}: {
  entry: AuditEntry;
  now: Date;
  rail?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const sentence = describe(entry);
  const mark = markFor(entry);
  const panelId = `audit-${entry.id}`;

  return (
    <li className="relative flex gap-3.5 pb-5 last:pb-0">
      {rail && (
        <span
          aria-hidden="true"
          className="absolute bottom-0 left-[11px] top-7 w-px bg-line"
        />
      )}
      <span
        aria-hidden="true"
        className={cn(
          "relative z-10 mt-1 flex size-6 shrink-0 items-center justify-center rounded-full border-4 border-surface [&>svg]:size-3",
          DOTS[mark.tone],
        )}
      >
        {mark.icon}
      </span>

      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex w-full items-start gap-3 rounded-sm px-1 py-0.5 text-left hover:bg-canvas focus:outline-none focus-visible:ring-3 focus-visible:ring-accent/25"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-body-sm leading-snug text-ink">
              {sentence.text}
            </span>
            <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-muted">
              <time dateTime={entry.at} title={fullStamp(entry.at)}>
                {timeLabel(entry.at, now)}
              </time>
              <span aria-hidden="true" className="text-line-strong">
                ·
              </span>
              <span>{entry.entity.noun}</span>
              {entry.redactedFields.length > 0 && (
                <Badge tone="neutral" size="sm">
                  Value not shown
                </Badge>
              )}
              {entry.isRead && (
                <Badge tone="neutral" size="sm">
                  Read only
                </Badge>
              )}
            </span>
          </span>
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "mt-1 size-4 shrink-0 text-faint transition-transform duration-150",
              open && "rotate-180",
            )}
          />
        </button>

        {open && (
          <div id={panelId} className="mt-2.5 px-1">
            <EventDetail id={entry.id} />
          </div>
        )}
      </div>
    </li>
  );
}

/* ----------------------------------------------------------------- detail */

/**
 * The before and after, fetched when a row is opened.
 *
 * The list route carries no values at all, so this is a second request — and it
 * writes its own event, which is the API's design and not something to work
 * around by prefetching every row.
 */
function EventDetail({ id }: { id: string }) {
  const { detail, loading, error } = useAuditEvent(id);

  if (loading) {
    return (
      <div className="rounded-md border border-line bg-canvas px-4 py-3">
        <Spinner size="sm" label="Loading what changed" />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <p className="rounded-md border border-line bg-canvas px-4 py-3 text-body-sm text-body">
        {error ? error.message : "This entry could not be opened."}
      </p>
    );
  }

  return <Changes detail={detail} />;
}

export function Changes({ detail }: { detail: AuditEntryDetail }) {
  const facts = detail.diff.details.filter((fact) => fact.field !== "note");
  const note = detail.diff.details.find((fact) => fact.field === "note");
  const nothing =
    detail.diff.changes.length === 0 && facts.length === 0 && !note && !detail.diff.raw;

  return (
    <div className="flex flex-col gap-3">
      {detail.diff.changes.length > 0 && (
        <TableWrap caption="Fields that changed, with the value before and after">
          <THead>
            <TH>Field</TH>
            <TH>Before</TH>
            <TH>After</TH>
          </THead>
          <TBody>
            {detail.diff.changes.map((change) => (
              <TR key={change.field}>
                <TH scope="row" className="font-medium text-ink">
                  {prettyField(change.label)}
                </TH>
                {change.redacted ? (
                  /* No value on either side — the fact of the change is the
                     whole record here. Kept as two cells rather than one
                     spanning both so a diff with a mix of redacted and plain
                     rows keeps its columns aligned. See `diff.ts` in the API
                     for why the redaction is unconditional rather than
                     permission-dependent. */
                  <>
                    <TD className="text-muted">Not shown</TD>
                    <TD>
                      <Badge tone="warning" size="sm">
                        Changed
                      </Badge>
                    </TD>
                  </>
                ) : (
                  <>
                    <TD>
                      <Value field={change.field} value={change.from} />
                    </TD>
                    <TD className="text-ink">
                      <Value field={change.field} value={change.to} />
                    </TD>
                  </>
                )}
              </TR>
            ))}
          </TBody>
        </TableWrap>
      )}

      {facts.length > 0 && (
        <div className="rounded-md border border-line bg-canvas px-4 py-3.5">
          <DescriptionList
            columns={2}
            items={facts.map((fact) => ({
              term: prettyField(fact.label),
              value: <Value field={fact.field} value={fact.value} />,
            }))}
          />
        </div>
      )}

      {note && (
        <p className="text-body-sm leading-relaxed text-body">
          {formatFieldValue(note.field, note.value).text}
        </p>
      )}

      {detail.diff.raw !== undefined && (
        <p className="rounded-md border border-line bg-canvas px-4 py-3 text-body-sm text-body">
          {formatFieldValue("raw", detail.diff.raw).text}
        </p>
      )}

      {nothing && (
        <p className="text-body-sm text-muted">
          Nothing on the record changed — this is the action itself.
        </p>
      )}

      <p className="text-meta leading-relaxed text-muted">
        {fullStamp(detail.at)}
        {detail.actorEmail ? ` · ${detail.actorEmail}` : ""}
        {detail.ipAddress ? ` · from ${detail.ipAddress}` : ""}
      </p>
    </div>
  );
}

function Value({ field, value }: { field: string; value: unknown }) {
  const formatted = formatFieldValue(field, value);
  return (
    <span
      className={cn(
        "break-words",
        formatted.kind === "empty" && "text-faint",
        formatted.kind === "hidden" && "text-muted",
      )}
    >
      {formatted.text}
    </span>
  );
}

"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Lock,
  MessageSquare,
  RotateCcw,
  Send,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/cn";
import {
  Avatar,
  Badge,
  Button,
  DescriptionList,
  Drawer,
  Field,
  Modal,
  SegmentedControl,
  Select,
  Skeleton,
  Textarea,
  useToast,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { ApiError } from "@/lib/api/client";
import {
  formatWorkingMinutes,
  type TicketPriority,
} from "@/lib/api/helpdesk";
import { useCan } from "@/lib/permissions";
import { useSession } from "@/lib/store/session";
import { useEmployeeDirectory } from "@/lib/store/employees-api";
import { useTicket } from "@/lib/store/helpdesk";
import { INTERNAL_LABEL, InternalBadge, PRIORITY, TicketClockBadge } from "./ticket-labels";

/**
 * One ticket, as a conversation.
 *
 * Not a form. The opening message and every reply in the order they were
 * written, oldest at the top, because that is how somebody catches up on a
 * ticket they have just been handed.
 *
 * ## Internal notes
 *
 * A note between staff is set apart three ways — a dashed border, a tinted
 * ground, and the sentence **"Internal — the requester cannot see this"** on the
 * note itself. Never colour alone, because the cost of misreading this one is
 * that somebody writes "her manager says she is on a final warning" into a
 * thread the person can read.
 *
 * The client never decides who may read a note. The API strips them before they
 * reach the wire, and it strips them for the **requester whatever permissions
 * they hold** — an HR administrator reading a ticket they raised themselves does
 * not see the notes on it. `showsInternalNotes` only says whether this reader is
 * being shown them, which is what the composer needs so it does not offer a
 * control the API would refuse.
 *
 * ## Resolve is one button
 *
 * It asks for one thing: what you did. The API posts that as a public reply
 * rather than filing it in a private field, because "resolved" with nothing
 * against it is how the same ticket comes back next week.
 */
export function TicketThread({
  id,
  onClose,
  onChanged,
  minutesPerDay,
}: {
  /**
   * The ticket to show. The caller mounts this component only when there is
   * one, rather than passing null — so nothing here fetches until a reader has
   * actually opened something.
   */
  id: string;
  onClose: () => void;
  /** Called after any write, so the list behind can pull itself forward. */
  onChanged: () => void;
  minutesPerDay: number;
}) {
  const handlesTickets = useCan("EDIT_RECORDS");
  const { actingId } = useSession();
  const toast = useToast();
  const ticket = useTicket(id);

  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<"reply" | "note">("reply");
  const [busy, setBusy] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [reopening, setReopening] = useState(false);

  const detail = ticket.ticket;
  const iRaisedIt = detail?.requester?.id === actingId;
  const canWorkIt = handlesTickets || detail?.assignee?.id === actingId;
  const resolved = detail?.status === "RESOLVED";

  /** Every write reports its own failure. The API's message is the useful part. */
  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await action();
      toast.push({ title: success, tone: "success" });
      onChanged();
      return true;
    } catch (error) {
      toast.push({
        title: "That did not work",
        tone: "danger",
        detail:
          error instanceof ApiError
            ? error.message
            : "Something went wrong. Try again.",
      });
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Drawer
        open
        onClose={onClose}
        title={detail ? detail.subject : "Request"}
        {...(detail ? { description: `${detail.reference} · ${detail.category}` } : {})}
        size="xl"
        footer={
          detail ? (
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                {resolved ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setReopening(true)}
                  >
                    <RotateCcw aria-hidden="true" className="size-4" />
                    Not fixed
                  </Button>
                ) : (
                  canWorkIt && (
                    <Button
                      variant="accent"
                      size="sm"
                      disabled={busy}
                      onClick={() => setResolving(true)}
                    >
                      <CheckCircle2 aria-hidden="true" className="size-4" />
                      Resolve
                    </Button>
                  )
                )}
                {!resolved && handlesTickets && detail.assignee === null && (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={() => void run(ticket.takeIt, "It is yours now")}
                  >
                    <UserPlus aria-hidden="true" className="size-4" />
                    Take it
                  </Button>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={onClose}>
                Close
              </Button>
            </div>
          ) : undefined
        }
      >
        {ticket.loading && (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-20" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        )}

        <LoadFailure subject="this ticket" error={ticket.error} />

        {detail && (
          <div className="flex flex-col gap-5">
            <DescriptionList
              columns={2}
              items={[
                {
                  term: "Raised by",
                  value: detail.requester ? (
                    <span className="flex items-center gap-2">
                      <Avatar name={detail.requester.name} size="xs" />
                      {detail.requester.name}
                    </span>
                  ) : (
                    <span className="text-muted">Not recorded</span>
                  ),
                },
                {
                  term: "Who has it",
                  value: detail.assignee ? (
                    detail.assignee.name
                  ) : (
                    <Badge tone="warning" size="sm">
                      Nobody yet
                    </Badge>
                  ),
                },
                {
                  term: "Where it stands",
                  value: (
                    <TicketClockBadge
                      ticket={detail}
                      minutesPerDay={minutesPerDay}
                    />
                  ),
                },
                {
                  term: "Urgency",
                  value: (
                    <Badge tone={PRIORITY[detail.priority].tone} size="sm">
                      {PRIORITY[detail.priority].label}
                    </Badge>
                  ),
                },
                {
                  term: "Reply promised within",
                  value:
                    detail.sla?.firstResponseMinutes != null ? (
                      formatWorkingMinutes(
                        detail.sla.firstResponseMinutes,
                        minutesPerDay,
                      )
                    ) : (
                      <span className="text-muted">No target set</span>
                    ),
                },
                {
                  term: "First reply took",
                  value:
                    detail.responseWorkingMinutes != null ? (
                      formatWorkingMinutes(
                        detail.responseWorkingMinutes,
                        minutesPerDay,
                      )
                    ) : (
                      <span className="text-muted">Nobody has replied yet</span>
                    ),
                },
              ]}
            />

            {handlesTickets && !resolved && (
              <TriageRow
                priority={detail.priority}
                assigneeId={detail.assignee?.id ?? null}
                busy={busy}
                onPriority={(value) =>
                  void run(
                    () => ticket.setPriority(value),
                    `Marked ${PRIORITY[value].label.toLowerCase()}`,
                  )
                }
                onAssign={(value) =>
                  void run(
                    () => ticket.handOver(value),
                    value === null ? "Back in the queue" : "Handed over",
                  )
                }
              />
            )}

            <div className="flex flex-col gap-3">
              <h3 className="text-body-sm font-semibold text-ink">
                The conversation
              </h3>

              {detail.body && (
                <Message
                  authorName={detail.requester?.name ?? "Whoever raised it"}
                  body={detail.body}
                  at={detail.raisedAt}
                  internal={false}
                  opening
                />
              )}

              {detail.comments.map((entry) => (
                <Message
                  key={entry.id}
                  authorName={entry.author?.name ?? "Somebody who has left"}
                  body={entry.body}
                  at={entry.createdAt}
                  internal={entry.internal}
                />
              ))}

              {!detail.body && detail.comments.length === 0 && (
                <p className="text-body-sm text-muted">
                  Nothing written yet. The first reply starts the thread.
                </p>
              )}
            </div>

            {resolved ? (
              <p className="text-body-sm text-muted">
                Sorted. Still not right? Press{" "}
                <span className="font-medium text-ink">Not fixed</span> below.
              </p>
            ) : (
              <Composer
                canLeaveNote={detail.showsInternalNotes}
                mode={mode}
                onMode={setMode}
                draft={draft}
                onDraft={setDraft}
                busy={busy}
                iRaisedIt={Boolean(iRaisedIt)}
                onSend={async () => {
                  const body = draft.trim();
                  if (body.length === 0) return;
                  const internal = mode === "note";
                  const ok = await run(
                    () => ticket.reply(body, internal),
                    internal ? "Note saved for staff" : "Reply sent",
                  );
                  if (ok) setDraft("");
                }}
              />
            )}
          </div>
        )}
      </Drawer>

      {resolving && detail && (
        <ResolveModal
          busy={busy}
          onClose={() => setResolving(false)}
          onResolve={async (resolution) => {
            const ok = await run(
              () => ticket.resolve(resolution),
              `${detail.reference} is sorted`,
            );
            if (ok) setResolving(false);
          }}
        />
      )}

      {reopening && detail && (
        <ReopenModal
          busy={busy}
          onClose={() => setReopening(false)}
          onReopen={async (reason) => {
            const ok = await run(
              () => ticket.reopen(reason),
              `${detail.reference} is open again`,
            );
            if (ok) setReopening(false);
          }}
        />
      )}
    </>
  );
}

/* -------------------------------------------------------------------- triage */

/**
 * The two things triage changes: how urgent it is, and whose desk it is on.
 *
 * Its own component so the employee directory is fetched **only** for somebody
 * who can hand a ticket over. A staff member reading their own request has no
 * business calling the directory endpoint, and a request that would come back
 * 403 is a request not worth making.
 */
function TriageRow({
  priority,
  assigneeId,
  busy,
  onPriority,
  onAssign,
}: {
  priority: TicketPriority;
  assigneeId: string | null;
  busy: boolean;
  onPriority: (priority: TicketPriority) => void;
  onAssign: (assigneeId: string | null) => void;
}) {
  const { employees } = useEmployeeDirectory({ pageSize: 200 });

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-canvas p-4">
      <Field label="Urgency" className="min-w-[10rem]">
        <Select
          value={priority}
          disabled={busy}
          onChange={(event) => {
            const value = event.target.value as TicketPriority;
            onPriority(value);
          }}
        >
          <option value="HIGH">Urgent</option>
          <option value="NORMAL">Normal</option>
          <option value="LOW">Whenever</option>
        </Select>
      </Field>
      <Field label="Who has it" className="min-w-[13rem] flex-1">
        <Select
          value={assigneeId ?? ""}
          disabled={busy}
          onChange={(event) => {
            const value = event.target.value;
            onAssign(value === "" ? null : value);
          }}
        >
          <option value="">Nobody — back in the queue</option>
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.firstName} {employee.lastName}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}

/* ------------------------------------------------------------------ a message */

function Message({
  authorName,
  body,
  at,
  internal,
  opening = false,
}: {
  authorName: string;
  body: string;
  at: string;
  internal: boolean;
  opening?: boolean;
}) {
  return (
    <article
      className={cn(
        "rounded-lg border p-4",
        internal
          ? "border-dashed border-ink-soft bg-sunken"
          : "border-line bg-surface",
      )}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Avatar name={authorName} size="xs" />
        <span className="text-body-sm font-medium text-ink">{authorName}</span>
        <span className="text-meta text-muted">{when(at)}</span>
        {opening && (
          <Badge tone="neutral" size="sm">
            What they asked
          </Badge>
        )}
        {internal && <InternalBadge />}
      </div>
      <p className="whitespace-pre-wrap text-body-sm leading-relaxed text-body">
        {body}
      </p>
    </article>
  );
}

/** `2026-08-19T09:12:00Z` → `19 Aug, 10:12`. Local, because a thread is read now. */
function when(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ----------------------------------------------------------------- composing */

/**
 * One box, two verbs.
 *
 * The internal-note switch only appears for somebody the API is already showing
 * notes to. Offering it to a requester would be a control that fails on press,
 * and the API refuses `internal: true` from them on the way in — not merely
 * filtered on the way out.
 *
 * When the switch is on, the label that will sit on the saved note is shown
 * before it is written, so nobody discovers what "internal" meant afterwards.
 */
function Composer({
  canLeaveNote,
  mode,
  onMode,
  draft,
  onDraft,
  busy,
  iRaisedIt,
  onSend,
}: {
  canLeaveNote: boolean;
  mode: "reply" | "note";
  onMode: (mode: "reply" | "note") => void;
  draft: string;
  onDraft: (value: string) => void;
  busy: boolean;
  iRaisedIt: boolean;
  onSend: () => Promise<void>;
}) {
  const note = canLeaveNote && mode === "note";

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-canvas p-4">
      {canLeaveNote && (
        <SegmentedControl
          label="Who this goes to"
          options={[
            { value: "reply", label: "Reply to them" },
            { value: "note", label: "Internal note" },
          ]}
          value={mode}
          onChange={onMode}
        />
      )}

      <Field
        label={note ? "Note for staff" : "Your reply"}
        hideLabel
        help={
          note
            ? INTERNAL_LABEL
            : iRaisedIt
              ? "No email goes out — whoever is on it sees this in their ApproveHR notifications."
              : "No email goes out — they see this in their ApproveHR notifications."
        }
      >
        <Textarea
          value={draft}
          rows={3}
          placeholder={note ? "Something the requester must not read." : "Type your reply."}
          onChange={(event) => {
            const value = event.target.value;
            onDraft(value);
          }}
        />
      </Field>

      <div className="flex justify-end">
        <Button
          variant={note ? "secondary" : "accent"}
          size="sm"
          disabled={busy || draft.trim().length === 0}
          onClick={() => void onSend()}
        >
          {note ? (
            <Lock aria-hidden="true" className="size-4" />
          ) : (
            <Send aria-hidden="true" className="size-4" />
          )}
          {note ? "Save internal note" : "Send reply"}
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- resolving */

function ResolveModal({
  busy,
  onClose,
  onResolve,
}: {
  busy: boolean;
  onClose: () => void;
  onResolve: (resolution: string) => Promise<void>;
}) {
  const [resolution, setResolution] = useState("");
  const ready = resolution.trim().length >= 5;

  return (
    <Modal
      open
      onClose={onClose}
      title="Resolve it"
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="accent"
            disabled={!ready || busy}
            onClick={() => void onResolve(resolution.trim())}
          >
            {busy ? "Resolving…" : "Resolve"}
          </Button>
        </div>
      }
    >
      <Field
        label="What did you do?"
        required
        help="They see this in the thread, so write it for them, not for the file."
      >
        <Textarea
          value={resolution}
          autoFocus
          rows={4}
          placeholder="Reissued the July payslip. It is on your payslips page now."
          onChange={(event) => {
            const value = event.target.value;
            setResolution(value);
          }}
        />
      </Field>
    </Modal>
  );
}

function ReopenModal({
  busy,
  onClose,
  onReopen,
}: {
  busy: boolean;
  onClose: () => void;
  onReopen: (reason?: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");

  return (
    <Modal
      open
      onClose={onClose}
      title="Still not fixed"
      description="It goes back to whoever had it, with everything already written on it."
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="accent"
            disabled={busy}
            onClick={() => {
              const trimmed = reason.trim();
              void onReopen(trimmed.length >= 5 ? trimmed : undefined);
            }}
          >
            <MessageSquare aria-hidden="true" className="size-4" />
            {busy ? "Reopening…" : "Reopen"}
          </Button>
        </div>
      }
    >
      <Field
        label="What is still wrong?"
        help="Optional, but it saves them asking."
      >
        <Textarea
          value={reason}
          autoFocus
          rows={3}
          placeholder="The payslip is there but the figure is still the old one."
          onChange={(event) => {
            const value = event.target.value;
            setReason(value);
          }}
        />
      </Field>
    </Modal>
  );
}

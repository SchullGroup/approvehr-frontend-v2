"use client";

import { useState } from "react";
import { AlertTriangle, Check, Plus, ShieldAlert } from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  Field,
  Input,
  Modal,
  RadioCard,
  Spinner,
  Textarea,
  useToast,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import type { ApiAction, DisciplinaryLevel } from "@/lib/api/conduct";
import { useCan } from "@/lib/permissions";
import {
  LEVEL_HINT,
  LEVEL_LABEL,
  LEVEL_ORDER,
  LEVEL_TONE,
  actionStatus,
  dayLabel,
  lapseLabel,
  useConductRecord,
} from "@/lib/store/conduct";
import { useSession } from "@/lib/store/session";

/**
 * Somebody's conduct record, for the employee record page.
 *
 * A panel rather than a route: a warning is a fact about an employment record
 * and belongs on it, next to the leave and the pay. There is no
 * `/people/[id]/conduct` page and there should not be — one more URL for one
 * more audience is exactly how the incumbent got to ~120 routes.
 *
 * ## Three readers, one panel
 *
 * | Who | Sees | Can |
 * |---|---|---|
 * | The person themselves | their own record | confirm they were told, and disagree |
 * | Somebody with `EDIT_RECORDS` | anybody's | record a warning, edit one |
 * | Anybody else | a refusal | nothing |
 *
 * There is no fourth case. Not the manager, not the department head. A manager
 * who needs to see their report's record needs `EDIT_RECORDS`, and that cost is
 * deliberate — this is the most sensitive data in the product.
 *
 * **Only the subject can confirm.** An administrator holding every permission in
 * the enum gets a 403 from the API on that one call, because a confirmation
 * somebody else entered is manufactured evidence. So the confirm buttons are
 * rendered on identity, never on permission.
 *
 * ## Every read here is audited
 *
 * `GET /conduct/employees/:id/actions` writes an audit event before it answers.
 * Nothing in this panel polls or re-fetches on an interval: the audit trail is
 * what answers "who has been looking at this person's warnings", and filling it
 * with reads nobody made would make it unsearchable.
 */
export function ConductPanel({
  employeeId,
  className,
}: {
  employeeId: string;
  className?: string;
}) {
  const { employeeId: me } = useSession();
  const canEdit = useCan("EDIT_RECORDS");
  const conduct = useConductRecord(employeeId);
  const toast = useToast();

  const isSubject = me !== null && me === employeeId;
  const [recording, setRecording] = useState(false);
  const [confirming, setConfirming] = useState<ApiAction | null>(null);
  const [editing, setEditing] = useState<ApiAction | null>(null);

  const run = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      toast.push({ title: success, tone: "success" });
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
    }
  };

  /* A 403 here is a normal outcome rather than a failure: most people cannot
     read most records, which is the point. Say so plainly and stop. */
  if (conduct.error?.status === 403) {
    return (
      <Card className={className}>
        <CardHeader title="Conduct" level={3} />
        <CardBody>
          <p className="text-body-sm text-body">
            This record is not yours to read.
          </p>
        </CardBody>
      </Card>
    );
  }

  const { summary, actions } = conduct.record;

  /**
   * The one number a manager actually asks for, said once.
   *
   * Undefined when there is nothing on file, because the card body already says
   * so and two ways of saying "none" is one too many. "Still counts" rather than
   * "active": a lapsed warning has not been deleted, it has stopped counting,
   * and that is the distinction a disciplinary meeting turns on.
   */
  const headline =
    summary.total === 0
      ? undefined
      : summary.active === 0
        ? `${summary.total} on file, none still counting.`
        : `${summary.active} of ${summary.total} still ${
            summary.active === 1 ? "counts" : "count"
          }.`;

  return (
    <>
      <Card className={className}>
        <CardHeader
          title="Conduct"
          level={3}
          {...(conduct.loading || !headline ? {} : { description: headline })}
          action={
            canEdit && conduct.editable ? (
              <Button variant="secondary" size="sm" onClick={() => setRecording(true)}>
                <Plus aria-hidden="true" className="size-3.5" />
                Record a warning
              </Button>
            ) : undefined
          }
        />

        <CardBody className="flex flex-col gap-3">
          {conduct.loading ? (
            <div className="flex items-center gap-2 text-body-sm text-muted">
              <Spinner size="sm" />
              Loading
            </div>
          ) : conduct.error ? (
            <p className="text-body-sm text-body">{conduct.error.message}</p>
          ) : actions.length === 0 ? (
            <p className="text-body-sm text-body">
              No warnings have been recorded.
            </p>
          ) : (
            <>
              {summary.awaitingConfirmation > 0 && !isSubject && (
                <Callout tone="warning" title="Not confirmed yet">
                  {summary.awaitingConfirmation} of these has not been confirmed
                  by the employee. Only they can do it.
                </Callout>
              )}

              <ol className="flex flex-col gap-2">
                {actions.map((action) => (
                  <ActionRow
                    key={action.id}
                    action={action}
                    canEdit={canEdit && conduct.editable}
                    isSubject={isSubject}
                    onConfirm={() => setConfirming(action)}
                    onEdit={() => setEditing(action)}
                  />
                ))}
              </ol>
            </>
          )}

          {!conduct.editable && actions.length > 0 && (
            <p className="text-meta text-muted">
              Demo record. Saving a warning needs the API.
            </p>
          )}
        </CardBody>
      </Card>

      {recording && (
        <RecordWarningModal
          employeeId={employeeId}
          employeeName={conduct.record.employee.name || "this person"}
          onClose={() => setRecording(false)}
          onSave={async (body) => {
            let told: boolean | null = null;
            const ok = await run(async () => {
              const created = await conduct.recordAction(body);
              told = created.employeeNotified;
            }, "Recorded");
            if (!ok) return;
            setRecording(false);
            /* Honest rather than assumed: `employeeNotified: false` means the
               product reached nobody, so somebody has to hand over the letter.
               There is no mail transport behind any of this either. */
            if (told === false) {
              toast.push({
                title: "Nobody was told",
                tone: "warning",
                detail: `${conduct.record.employee.name || "This person"} has no sign-in, so give them the letter yourself.`,
              });
            }
          }}
        />
      )}

      {confirming && (
        <ConfirmToldModal
          key={confirming.id}
          action={confirming}
          onClose={() => setConfirming(null)}
          onConfirm={async (body) => {
            const ok = await run(
              () => conduct.confirm(confirming.id, body),
              body.dispute ? "Confirmed, and your disagreement is on the record" : "Confirmed",
            );
            if (ok) setConfirming(null);
          }}
        />
      )}

      {editing && (
        <EditActionModal
          key={editing.id}
          action={editing}
          onClose={() => setEditing(null)}
          onSave={async (body) => {
            const ok = await run(() => conduct.update(editing.id, body), "Saved");
            if (ok) setEditing(null);
          }}
        />
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */

function ActionRow({
  action,
  canEdit,
  isSubject,
  onConfirm,
  onEdit,
}: {
  action: ApiAction;
  canEdit: boolean;
  isSubject: boolean;
  onConfirm: () => void;
  onEdit: () => void;
}) {
  const status = actionStatus(action);

  return (
    <li className="rounded-md border border-line p-3">
      <div className="flex flex-wrap items-start gap-3">
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sunken text-muted [&>svg]:size-4"
        >
          {action.active ? (
            <AlertTriangle aria-hidden="true" />
          ) : (
            <ShieldAlert aria-hidden="true" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            <span className="tabular text-body-sm font-medium text-ink">
              {dayLabel(action.incidentOn)}
            </span>
            <Badge tone={LEVEL_TONE[action.level]} size="sm">
              {LEVEL_LABEL[action.level]}
            </Badge>
            <Badge tone={status.tone} size="sm">
              {status.label}
            </Badge>
          </p>

          <p className="mt-1 text-body leading-relaxed text-ink">
            {action.summary}
          </p>

          {action.detail && (
            <p className="mt-1 text-body-sm leading-relaxed text-body">
              {action.detail}
            </p>
          )}

          {action.outcome && (
            <p className="mt-1.5 text-body-sm leading-relaxed text-body">
              <span className="font-medium text-ink">What was decided: </span>
              {action.outcome}
            </p>
          )}

          {action.disputeNote && (
            <p className="mt-1.5 rounded-md border border-danger-line bg-danger-soft p-2.5 text-body-sm leading-relaxed text-body">
              <span className="font-medium text-ink">They disagree: </span>
              {action.disputeNote}
            </p>
          )}

          <p className="mt-1.5 text-meta text-muted">
            {lapseLabel(action)}
            {action.issuedByName && <> · given by {action.issuedByName}</>}
            {action.acknowledgedAt && (
              <> · confirmed {dayLabel(action.acknowledgedAt.slice(0, 10))}</>
            )}
          </p>
        </div>

        <div className="flex w-full flex-wrap gap-1.5 sm:w-auto sm:shrink-0">
          {/* Rendered on identity, never on permission: the API refuses this
              call for everybody except the subject, whatever they hold. */}
          {isSubject && action.awaitingConfirmation && (
            <Button variant="approve" size="sm" onClick={onConfirm}>
              <Check aria-hidden="true" className="size-3.5" />
              Yes, I was told
            </Button>
          )}
          {canEdit && (
            <Button variant="ghost" size="sm" onClick={onEdit}>
              Edit
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

/* -------------------------------------------------------------------------- */

const MIN_SUMMARY = 5;

/**
 * Recording a warning, deliberately not quick.
 *
 * Four things, in the order somebody actually knows them: how serious it is,
 * what happened, when, and how long it counts for. The level is a list of five
 * cards rather than a dropdown because choosing between a written and a final
 * written warning is a decision about a person's job, and a dropdown makes it
 * look like a preference.
 *
 * The last line before the button says who will be able to see this. One line —
 * not a paragraph about data protection.
 */
function RecordWarningModal({
  employeeId,
  employeeName,
  onClose,
  onSave,
}: {
  employeeId: string;
  employeeName: string;
  onClose: () => void;
  onSave: (body: {
    employeeId: string;
    level: DisciplinaryLevel;
    incidentOn: string;
    summary: string;
    detail?: string;
    outcome?: string;
    expiresOn?: string;
  }) => Promise<void>;
}) {
  /* The real clock, not the demo's `TODAY`: the API refuses a future incident
     against the wall clock, and this modal only ever mounts on a click, so
     there is no server render to disagree with. */
  const today = new Date().toISOString().slice(0, 10);

  const [level, setLevel] = useState<DisciplinaryLevel | "">("");
  const [incidentOn, setIncidentOn] = useState(today);
  const [summary, setSummary] = useState("");
  const [detail, setDetail] = useState("");
  const [outcome, setOutcome] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [busy, setBusy] = useState(false);

  const dateProblem =
    incidentOn === ""
      ? "Say when it happened."
      : incidentOn > today
        ? "That day has not happened yet."
        : expiresOn !== "" && expiresOn <= incidentOn
          ? "It has to count for at least a day after the incident."
          : undefined;

  const ready =
    level !== "" && summary.trim().length >= MIN_SUMMARY && dateProblem === undefined;

  return (
    <Modal
      open
      onClose={onClose}
      title={`Record a warning for ${employeeName}`}
      size="lg"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <p className="text-body-sm text-body">
            {employeeName} will see this, and so will anyone who can edit staff
            records.
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="accent"
              disabled={!ready || busy}
              onClick={() => {
                if (level === "") return;
                setBusy(true);
                void onSave({
                  employeeId,
                  level,
                  incidentOn,
                  summary: summary.trim(),
                  ...(detail.trim() ? { detail: detail.trim() } : {}),
                  ...(outcome.trim() ? { outcome: outcome.trim() } : {}),
                  ...(expiresOn ? { expiresOn } : {}),
                }).finally(() => setBusy(false));
              }}
            >
              {busy ? "Saving…" : "Record it"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-body-sm font-medium text-ink">
            How serious is it?
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {LEVEL_ORDER.map((option) => (
              <RadioCard
                key={option}
                name="conduct-level"
                value={option}
                label={LEVEL_LABEL[option]}
                description={LEVEL_HINT[option]}
                checked={level === option}
                onChange={() => setLevel(option)}
              />
            ))}
          </div>
        </fieldset>

        <Field
          label="What happened"
          required
          help="One line. The detail goes below."
        >
          <Input
            value={summary}
            maxLength={300}
            placeholder="Left a client site without telling anyone."
            onChange={(e) => {
              const v = e.target.value;
              setSummary(v);
            }}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="When it happened"
            required
            {...(dateProblem ? { error: dateProblem } : {})}
          >
            <Input
              type="date"
              value={incidentOn}
              max={today}
              onChange={(e) => {
                const v = e.target.value;
                setIncidentOn(v);
              }}
            />
          </Field>

          <Field
            label="Counts until"
            help="The last day it counts. Leave it blank and it never lapses."
          >
            <Input
              type="date"
              value={expiresOn}
              onChange={(e) => {
                const v = e.target.value;
                setExpiresOn(v);
              }}
            />
          </Field>
        </div>

        <Field optional label="The detail" help="Dates, names, what was said.">
          <Textarea
            rows={5}
            value={detail}
            maxLength={8000}
            onChange={(e) => {
              const v = e.target.value;
              setDetail(v);
            }}
          />
        </Field>

        <Field
          optional
          label="What was decided"
          help="Often written up after the meeting.">
          <Textarea
            rows={3}
            value={outcome}
            maxLength={2000}
            onChange={(e) => {
              const v = e.target.value;
              setOutcome(v);
            }}
          />
        </Field>
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * The subject confirming they were told, and disagreeing in the same act.
 *
 * One dialog rather than two buttons, because being told and disagreeing happen
 * in the same conversation — and a separate dispute route would allow "disputed
 * but unacknowledged", which means nothing. Confirming is not agreeing, and the
 * checkbox is where the difference lives instead of a paragraph saying so.
 */
function ConfirmToldModal({
  action,
  onClose,
  onConfirm,
}: {
  action: ApiAction;
  onClose: () => void;
  onConfirm: (body: { dispute: boolean; disputeNote?: string }) => Promise<void>;
}) {
  const [dispute, setDispute] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const ready = !dispute || note.trim().length >= 3;

  return (
    <Modal
      open
      onClose={onClose}
      title="Confirm you were told"
      size="md"
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Not now
          </Button>
          <Button
            variant="approve"
            disabled={!ready || busy}
            onClick={() => {
              setBusy(true);
              void onConfirm({
                dispute,
                ...(dispute ? { disputeNote: note.trim() } : {}),
              }).finally(() => setBusy(false));
            }}
          >
            {busy ? "Saving…" : dispute ? "Confirm and disagree" : "Confirm"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="rounded-md border border-line bg-canvas p-3">
          <p className="flex flex-wrap items-center gap-2">
            <span className="tabular text-body-sm font-medium text-ink">
              {dayLabel(action.incidentOn)}
            </span>
            <Badge tone={LEVEL_TONE[action.level]} size="sm">
              {LEVEL_LABEL[action.level]}
            </Badge>
          </p>
          <p className="mt-1 text-body leading-relaxed text-ink">
            {action.summary}
          </p>
        </div>

        <p className="text-body text-body">
          Confirming means you were told. It does not mean you agree.
        </p>

        <Checkbox
          label="I disagree with this"
          checked={dispute}
          onChange={(e) => {
            const on = e.target.checked;
            setDispute(on);
          }}
        />

        {dispute && (
          <Field label="Why you disagree" required>
            <Textarea
              rows={5}
              value={note}
              maxLength={2000}
              autoFocus
              onChange={(e) => {
                const v = e.target.value;
                setNote(v);
              }}
            />
          </Field>
        )}
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Editing a record.
 *
 * Once the employee has confirmed they were told, the level, the day and the
 * one-line summary are frozen — the API refuses them and names who confirmed
 * and when. So this form simply stops offering them, and shows them as the
 * facts they now are. A field that cannot be saved should not be a field.
 */
function EditActionModal({
  action,
  onClose,
  onSave,
}: {
  action: ApiAction;
  onClose: () => void;
  onSave: (body: {
    level?: DisciplinaryLevel;
    incidentOn?: string;
    summary?: string;
    detail?: string | null;
    outcome?: string | null;
    expiresOn?: string | null;
  }) => Promise<void>;
}) {
  const open = action.awaitingConfirmation;
  const today = new Date().toISOString().slice(0, 10);

  const [level, setLevel] = useState<DisciplinaryLevel>(action.level);
  const [incidentOn, setIncidentOn] = useState(action.incidentOn);
  const [summary, setSummary] = useState(action.summary);
  const [detail, setDetail] = useState(action.detail ?? "");
  const [outcome, setOutcome] = useState(action.outcome ?? "");
  const [expiresOn, setExpiresOn] = useState(action.expiresOn ?? "");
  const [busy, setBusy] = useState(false);

  const dateProblem =
    !open || incidentOn === ""
      ? undefined
      : incidentOn > today
        ? "That day has not happened yet."
        : undefined;
  const lapseProblem =
    expiresOn !== "" && expiresOn <= incidentOn
      ? "It has to count for at least a day after the incident."
      : undefined;

  const ready =
    (!open || summary.trim().length >= MIN_SUMMARY) &&
    dateProblem === undefined &&
    lapseProblem === undefined;

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit this record"
      size="lg"
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="accent"
            disabled={!ready || busy}
            onClick={() => {
              setBusy(true);
              void onSave({
                ...(open
                  ? {
                      ...(level !== action.level ? { level } : {}),
                      ...(incidentOn !== action.incidentOn ? { incidentOn } : {}),
                      ...(summary.trim() !== action.summary
                        ? { summary: summary.trim() }
                        : {}),
                    }
                  : {}),
                detail: detail.trim() === "" ? null : detail.trim(),
                outcome: outcome.trim() === "" ? null : outcome.trim(),
                expiresOn: expiresOn === "" ? null : expiresOn,
              }).finally(() => setBusy(false));
            }}
          >
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {open ? (
          <>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-body-sm font-medium text-ink">
                How serious is it?
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {LEVEL_ORDER.map((option) => (
                  <RadioCard
                    key={option}
                    name="conduct-level-edit"
                    value={option}
                    label={LEVEL_LABEL[option]}
                    description={LEVEL_HINT[option]}
                    checked={level === option}
                    onChange={() => setLevel(option)}
                  />
                ))}
              </div>
            </fieldset>

            <Field label="What happened" required>
              <Input
                value={summary}
                maxLength={300}
                onChange={(e) => {
                  const v = e.target.value;
                  setSummary(v);
                }}
              />
            </Field>

            <Field
              label="When it happened"
              required
              {...(dateProblem ? { error: dateProblem } : {})}
            >
              <Input
                type="date"
                value={incidentOn}
                max={today}
                onChange={(e) => {
                  const v = e.target.value;
                  setIncidentOn(v);
                }}
              />
            </Field>
          </>
        ) : (
          <div className="rounded-md border border-line bg-canvas p-3">
            <p className="flex flex-wrap items-center gap-2">
              <span className="tabular text-body-sm font-medium text-ink">
                {dayLabel(action.incidentOn)}
              </span>
              <Badge tone={LEVEL_TONE[action.level]} size="sm">
                {LEVEL_LABEL[action.level]}
              </Badge>
              <Badge tone="neutral" size="sm">
                Confirmed {dayLabel(action.acknowledgedAt?.slice(0, 10) ?? null)}
              </Badge>
            </p>
            <p className="mt-1 text-body leading-relaxed text-ink">
              {action.summary}
            </p>
          </div>
        )}

        <Field
          label="Counts until"
          help="The last day it counts. Blank means it never lapses."
          {...(lapseProblem ? { error: lapseProblem } : {})}
        >
          <Input
            type="date"
            value={expiresOn}
            onChange={(e) => {
              const v = e.target.value;
              setExpiresOn(v);
            }}
          />
        </Field>

        <Field label="The detail">
          <Textarea
            rows={5}
            value={detail}
            maxLength={8000}
            onChange={(e) => {
              const v = e.target.value;
              setDetail(v);
            }}
          />
        </Field>

        <Field label="What was decided">
          <Textarea
            rows={3}
            value={outcome}
            maxLength={2000}
            onChange={(e) => {
              const v = e.target.value;
              setOutcome(v);
            }}
          />
        </Field>
      </div>
    </Modal>
  );
}

"use client";

import { useState } from "react";
import { Button, Callout, Field, Modal, Textarea } from "@/components/ui";
import {
  bulkCreateLines,
  createEmployeeLines,
  didNotJoinLines,
  people,
  REASON_MAX,
  REASON_MIN,
} from "@/lib/hiring/hired/copy";
import type { ExistingEmployee } from "@/lib/hiring/hired/errors";
import type { HiredPerson } from "@/lib/hiring/hired/model";

/**
 * The questions the Hired list asks before it acts on somebody.
 *
 * Each one says what will happen and what will not, in its own body and in its
 * button: "Create employee record", never a bare "Confirm". They stay mounted and
 * are told when to show, so their exit animation can run, and each keeps the last
 * person it was shown while it closes.
 */

/** The last person a dialog was given, kept while it fades. */
function useFrozen<T>(value: T | null): T | null {
  const [kept, setKept] = useState<T | null>(value);
  if (value && value !== kept) setKept(value);
  return value ?? kept;
}

function Failure({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-body-sm text-danger-text">
      {message}
    </p>
  );
}

/* --------------------------------------------------------- create employee */

export function CreateEmployeeDialog({
  open,
  onClose,
  person,
  busy,
  error,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  person: HiredPerson | null;
  busy: boolean;
  error: string | null;
  onConfirm: (person: HiredPerson) => void;
}) {
  const shown = useFrozen(person);
  if (!shown) return null;
  const lines = createEmployeeLines(shown);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={`Create an employee record for ${shown.name}?`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={() => onConfirm(shown)}
          >
            Create employee record
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-body-sm text-body">
        {lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
        <Failure message={error} />
      </div>
    </Modal>
  );
}

/* --------------------------------------------------------- link to existing */

/** What a refused attempt found: who the hire is, who already has their email, and what the API said. */
export type LinkOffer = {
  person: HiredPerson;
  existing: ExistingEmployee;
  /** The API's own sentence for the refusal. */
  said: string;
};

export function LinkEmployeeDialog({
  open,
  onClose,
  offer,
  busy,
  error,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  offer: LinkOffer | null;
  busy: boolean;
  error: string | null;
  onConfirm: (person: HiredPerson, employeeId: string) => void;
}) {
  const shown = useFrozen(offer);
  if (!shown) return null;
  const { person, existing, said } = shown;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={`Link ${person.name} to an employee who is already here?`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={existing.archived}
            onClick={() => onConfirm(person, existing.employeeId)}
          >
            Link to {existing.name}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-body-sm text-body">
        <p>{said}</p>
        <p className="rounded-md border border-line bg-canvas p-3">
          <span className="block font-medium text-ink">{existing.name}</span>
          {existing.employeeNo && (
            <span className="block text-muted">{existing.employeeNo}</span>
          )}
          {existing.email && (
            <span className="block text-muted">{existing.email}</span>
          )}
        </p>
        {existing.archived ? (
          <p className="text-warning-text">
            That record has been archived. Restore it in People first, or give
            this hire another email address.
          </p>
        ) : (
          <p>
            Linking marks this hire as that employee. Nothing is merged and
            nothing on either record changes, and no new employee record is
            created. If it is a different person who happens to share the email,
            cancel and sort that out first.
          </p>
        )}
        <Failure message={error} />
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------ did not join */

export function DidNotJoinDialog({
  open,
  onClose,
  person,
  busy,
  error,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  person: HiredPerson | null;
  busy: boolean;
  error: string | null;
  onConfirm: (person: HiredPerson, reason: string) => void;
}) {
  const shown = useFrozen(person);
  const [reason, setReason] = useState("");
  const [wasOpen, setWasOpen] = useState(false);

  /* Each time it opens it starts blank, so one person's reason is never offered
     for the next. Derived while rendering, not in an effect. */
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setReason("");
  }

  if (!shown) return null;
  const said = reason.trim();

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={`Mark ${shown.name} as did not join?`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={busy}
            disabled={said.length < REASON_MIN}
            onClick={() => onConfirm(shown, said)}
          >
            Mark as did not join
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 text-body-sm text-body">
          {didNotJoinLines(shown).map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
        <Field
          label="Why did they not join?"
          required
          help="Only your team sees this."
        >
          <Textarea
            rows={3}
            value={reason}
            maxLength={REASON_MAX}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
        <Failure message={error} />
      </div>
    </Modal>
  );
}

/* --------------------------------------------------------------- bulk create */

export function BulkCreateDialog({
  open,
  onClose,
  count,
  busy,
  error,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  count: number;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
}) {
  const [kept, setKept] = useState(count);
  if (count > 0 && count !== kept) setKept(count);
  const shown = count > 0 ? count : kept;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={`Create employee records for ${people(shown)}?`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={onConfirm}>
            Create {shown.toLocaleString("en-NG")} employee{" "}
            {shown === 1 ? "record" : "records"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-body-sm text-body">
        {bulkCreateLines(shown).map((line) => (
          <p key={line}>{line}</p>
        ))}
        {shown > 100 && (
          <Callout tone="info" title="This may take a minute">
            A long list is worked through in the background. You can watch it
            go, and the list tells you who was and was not done when it ends.
          </Callout>
        )}
        <Failure message={error} />
      </div>
    </Modal>
  );
}

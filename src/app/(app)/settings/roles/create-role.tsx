"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Field, Input, Modal, Select } from "@/components/ui";
import type { PermissionKey, PermissionSet } from "@/lib/permissions";
import { hasPermission } from "@/lib/permissions";
import type { RoleView } from "@/lib/store/permissions";
import type { InviteByEmailPerson } from "@/lib/api/invites";

/* A plain shape check, not the real gate — the API's own `.email()` answers
   that. This exists so a typo is caught before a request, not because the
   client is trusted to be right. */
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type PersonDraft = { firstName: string; lastName: string; email: string };

const EMPTY: PersonDraft = { firstName: "", lastName: "", email: "" };

/**
 * Create a role, optionally from an existing one, and put people in it.
 *
 * ## Duplicate is the same dialog, pre-answered
 *
 * "Duplicate this role" and "create a role" differ by one field, so they are one
 * dialog rather than two. Duplicating is also the only way to change a built-in
 * role, which makes it the more important of the two paths — arriving here from
 * the lock on `Payroll officer` should feel like continuing, not starting again.
 *
 * ## Copying trims what you cannot give out, and says how many
 *
 * The API refuses a create that grants a permission the caller does not hold, so
 * copying `Owner` as an HR manager would simply fail. Rather than fail, this
 * copies the permissions you *can* give out and says what it left behind. The
 * result is a role you can actually save, and a sentence naming the gap — which
 * is more use than an error that names a constant.
 *
 * ## A role with nobody in it is a role that does nothing
 *
 * So the people go in here, in the same breath, rather than being a second trip
 * to a second screen somebody has to know exists. They are invited by address
 * with no employee record — `invitesApi.sendByEmail`, see its own note — which
 * is what lets this work during setup, before a company has added anybody at
 * all.
 *
 * It is not compulsory. Defining the roles now and staffing them later is a real
 * way to work, and refusing to create `Branch manager` until somebody is named
 * would block it for no gain.
 *
 * ## Creating the role and inviting into it are two requests, and say so
 *
 * There is no endpoint that does both, and inventing one would mean a role
 * whose creation could be undone by a bad address. So the role is created
 * first and the invitations follow, each reported by name — a refused address
 * leaves the role standing, which is the right way round: the role is the
 * thing that cannot be retried without a duplicate-name error.
 */
export function CreateRoleDialog({
  roles,
  held,
  from,
  onClose,
  onCreate,
}: {
  roles: RoleView[];
  held: PermissionSet;
  /** Pre-selected source when arriving from a role's Duplicate action. */
  from: RoleView | null;
  onClose: () => void;
  /** Resolves true when the role was created — people are invited after. */
  onCreate: (
    body: { name: string; permissions: PermissionKey[] },
    people: InviteByEmailPerson[],
  ) => Promise<boolean>;
}) {
  const [name, setName] = useState(from ? `${from.name} (copy)` : "");
  const [sourceId, setSourceId] = useState(from?.id ?? "");
  const [people, setPeople] = useState<PersonDraft[]>([{ ...EMPTY }]);
  const [busy, setBusy] = useState(false);

  const source = useMemo(
    () => roles.find((role) => role.id === sourceId) ?? null,
    [roles, sourceId],
  );

  const copyable = useMemo(
    () => (source?.permissions ?? []).filter((key) => hasPermission(held, key)),
    [source, held],
  );

  const skipped = (source?.permissions.length ?? 0) - copyable.length;

  const setPerson = (index: number, patch: Partial<PersonDraft>) =>
    setPeople((current) =>
      current.map((draft, at) =>
        at === index ? { ...draft, ...patch } : draft,
      ),
    );

  /* A row nobody typed into is not an unfinished row — it is the empty one
     the form always offers. Only rows with something in them are judged. */
  const started = people.filter(
    (person) =>
      person.firstName.trim() || person.lastName.trim() || person.email.trim(),
  );
  const ready = started.filter(
    (person) =>
      person.firstName.trim() &&
      person.lastName.trim() &&
      LOOKS_LIKE_EMAIL.test(person.email.trim()),
  );
  const incomplete = started.length !== ready.length;

  return (
    <Modal
      open
      onClose={onClose}
      title={from ? `Duplicate ${from.name}` : "New role"}
      size="lg"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-body-sm text-muted">
            {started.length === 0
              ? "Nobody added yet"
              : `${ready.length} of ${started.length} ready to invite`}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="accent"
              disabled={name.trim().length < 2 || incomplete || busy}
              loading={busy}
              onClick={() => {
                setBusy(true);
                void onCreate(
                  { name: name.trim(), permissions: copyable },
                  ready.map((person) => ({
                    firstName: person.firstName.trim(),
                    lastName: person.lastName.trim(),
                    email: person.email.trim().toLowerCase(),
                  })),
                ).finally(() => setBusy(false));
              }}
            >
              {ready.length === 0
                ? "Create role"
                : `Create role and invite ${ready.length}`}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label="Name" required>
          <Input
            value={name}
            autoFocus
            placeholder="Branch manager"
            onChange={(e) => {
              const value = e.target.value;
              setName(value);
            }}
          />
        </Field>

        <Field
          label="Copy permissions from"
          help={
            source
              ? copyable.length === 0
                ? "Starts with nothing switched on. You can switch things on next."
                : `Copies ${copyable.length} permission${copyable.length === 1 ? "" : "s"}${
                    skipped > 0
                      ? `, and leaves ${skipped} off because you do not hold ${skipped === 1 ? "it" : "them"}.`
                      : "."
                  }`
              : "Starts with nothing switched on. You can switch things on next."
          }
        >
          <Select
            value={sourceId}
            onChange={(e) => {
              const value = e.target.value;
              setSourceId(value);
            }}
          >
            <option value="">Nothing — start empty</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </Select>
        </Field>

        {copyable.length > 0 && (
          <p className="text-body-sm leading-relaxed text-muted">
            {copyable
              .map(
                (key) => source?.labels[source.permissions.indexOf(key)] ?? key,
              )
              .join(", ")}
            .
          </p>
        )}

        <div className="flex flex-col gap-3 border-t border-line pt-5">
          <div>
            <p className="text-body-sm font-medium text-ink">
              Who is in this role
            </p>
            <p className="mt-0.5 text-body-sm leading-relaxed text-muted">
              Each one gets an email with a link to set their own password. They
              do not need a staff record — add that later if they are on the
              payroll.
            </p>
          </div>

          {people.map((person, index) => {
            const badEmail =
              person.email.trim().length > 0 &&
              !LOOKS_LIKE_EMAIL.test(person.email.trim());
            return (
              <div
                key={index}
                className="grid gap-2 sm:grid-cols-[1fr_1fr_1.6fr_auto]"
              >
                <Input
                  value={person.firstName}
                  placeholder="First name"
                  aria-label={`First name, person ${index + 1}`}
                  disabled={busy}
                  onChange={(e) =>
                    setPerson(index, { firstName: e.target.value })
                  }
                />
                <Input
                  value={person.lastName}
                  placeholder="Last name"
                  aria-label={`Last name, person ${index + 1}`}
                  disabled={busy}
                  onChange={(e) =>
                    setPerson(index, { lastName: e.target.value })
                  }
                />
                <Input
                  type="email"
                  value={person.email}
                  placeholder="their.name@company.com"
                  aria-label={`Work email, person ${index + 1}`}
                  aria-invalid={badEmail}
                  disabled={busy}
                  onChange={(e) => setPerson(index, { email: e.target.value })}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy || people.length === 1}
                  aria-label={`Remove person ${index + 1}`}
                  onClick={() =>
                    setPeople((current) =>
                      current.filter((_, at) => at !== index),
                    )
                  }
                >
                  <Trash2 aria-hidden="true" className="size-3.5" />
                </Button>
              </div>
            );
          })}

          <div>
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => setPeople((current) => [...current, { ...EMPTY }])}
            >
              <Plus aria-hidden="true" className="size-4" />
              Add another
            </Button>
          </div>

          {incomplete && (
            <p role="status" className="text-body-sm text-danger-text">
              Every person needs a first name, a last name and a work email.
              Clear the row if you did not mean to add them.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}

"use client";

import { useMemo, useState } from "react";
import { Button, Field, Input, Modal, Select, Textarea } from "@/components/ui";
import type { PermissionKey, PermissionSet } from "@/lib/permissions";
import { hasPermission } from "@/lib/permissions";
import type { RoleView } from "@/lib/store/permissions";

/**
 * Create a role, optionally from an existing one.
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
  onCreate: (body: {
    name: string;
    description?: string;
    permissions: PermissionKey[];
  }) => Promise<boolean>;
}) {
  const [name, setName] = useState(from ? `${from.name} (copy)` : "");
  const [description, setDescription] = useState(from?.description ?? "");
  const [sourceId, setSourceId] = useState(from?.id ?? "");
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

  return (
    <Modal
      open
      onClose={onClose}
      title={from ? `Duplicate ${from.name}` : "New role"}
      description="Start it with the permissions you want, then add people to it."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="accent"
            disabled={name.trim().length < 2 || busy}
            loading={busy}
            onClick={() => {
              setBusy(true);
              void onCreate({
                name: name.trim(),
                ...(description.trim() ? { description: description.trim() } : {}),
                permissions: copyable,
              }).finally(() => setBusy(false));
            }}
          >
            Create role
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
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
          label="What somebody in this role is responsible for"
          help="One line. It sits under the name everywhere the role appears."
        >
          <Textarea
            value={description}
            rows={2}
            placeholder="Runs one branch. Approves leave and expenses for their own staff."
            onChange={(e) => {
              const value = e.target.value;
              setDescription(value);
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
                (key) =>
                  source?.labels[source.permissions.indexOf(key)] ?? key,
              )
              .join(", ")}
            .
          </p>
        )}
      </div>
    </Modal>
  );
}

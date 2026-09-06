"use client";

import { useState } from "react";
import { Button, Callout, Checkbox, Field, Modal, Picker } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import type { PendingInvite } from "@/lib/api/invites";
import { useEmployeeDirectory } from "@/lib/store/employees-api";
import type { RoleView } from "@/lib/store/permissions";
import { fullName } from "@/lib/types";

/**
 * Invite somebody to sign in.
 *
 * The picker's candidates are `canLogin !== false` employees who are not
 * already in the pending list — a courtesy filter, not the real guard. The
 * real one is the API's: somebody who already holds an account, or is
 * recorded as not needing one, is refused there with a specific reason, and
 * that refusal is what surfaces if this filter ever falls out of date with
 * the backend rather than a second copy of the rule living here.
 */
export function SendInviteDialog({
  roles,
  pending,
  onClose,
  onSend,
}: {
  roles: RoleView[];
  pending: PendingInvite[];
  onClose: () => void;
  onSend: (employeeId: string, roleIds: string[]) => Promise<boolean>;
}) {
  const directory = useEmployeeDirectory({ pageSize: 200 });
  const [employeeId, setEmployeeId] = useState("");
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pendingIds = new Set(pending.map((p) => p.employeeId));
  const candidates = directory.employees.filter(
    (e) => e.canLogin !== false && !pendingIds.has(e.id),
  );

  const toggleRole = (id: string) =>
    setRoleIds((current) =>
      current.includes(id)
        ? current.filter((r) => r !== id)
        : [...current, id],
    );

  async function submit() {
    if (!employeeId || roleIds.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const ok = await onSend(employeeId, roleIds);
      if (ok) onClose();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Something went wrong. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Invite someone to sign in"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="accent"
            loading={busy}
            disabled={!employeeId || roleIds.length === 0}
            onClick={() => void submit()}
          >
            Send invitation
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {error && <Callout tone="danger">{error}</Callout>}

        <Field
          label="Who"
          required
          help="Only people entitled to sign in appear here. See Login access on their record."
        >
          <Picker
            value={employeeId}
            onChange={setEmployeeId}
            placeholder={directory.loading ? "Loading…" : "Choose somebody"}
            loading={directory.loading}
            options={candidates.map((e) => ({
              value: e.id,
              label: fullName(e),
              hint: e.jobTitle,
            }))}
          />
        </Field>

        <Field
          label="Roles"
          required
          help="What their account can do once they accept. At least one."
        >
          <div className="flex flex-col gap-2">
            {roles.map((role) => (
              <Checkbox
                key={role.id}
                checked={roleIds.includes(role.id)}
                onChange={() => toggleRole(role.id)}
                label={role.name}
              />
            ))}
          </div>
        </Field>
      </div>
    </Modal>
  );
}

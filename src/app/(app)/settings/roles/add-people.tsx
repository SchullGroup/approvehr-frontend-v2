"use client";

import { useMemo, useState } from "react";
import { Button, Checkbox, EmptyState, Input, Modal } from "@/components/ui";
import {
  useAssignableAccounts,
  useRoleMembers,
  type RoleView,
} from "@/lib/store/permissions";

/**
 * Put people into a role.
 *
 * ## The list is the accounts the API will name, and it says so
 *
 * There is no `GET /users` on the backend, and adding somebody to a role needs a
 * *user* id — which `/employees` does not carry. So the candidates come from the
 * membership of every existing role, which is genuinely everything the API will
 * disclose today. Somebody holding no role at all cannot appear, and the line
 * under the list says that plainly rather than implying the list is the company.
 *
 * The fix is one endpoint on the backend. Until it lands, an honest list beats a
 * complete-looking one.
 *
 * ## Why there is no free-text id field
 *
 * The obvious workaround is a box to paste a user id into. That would work, and
 * it would also be the only place in this product where the interface asks a
 * business owner for a UUID. A picker that is missing somebody is a gap; a UUID
 * field is a different product.
 */
export function AddPeopleDialog({
  role,
  roleIds,
  onClose,
  onAdd,
}: {
  role: RoleView;
  /** Every role's id. The union of their members is the account list. */
  roleIds: string[];
  onClose: () => void;
  onAdd: (userIds: string[]) => Promise<boolean>;
}) {
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  /* Every role's membership, unioned. In demo mode this is the seeded directory
     and the argument is ignored. */
  const { accounts, loading, note } = useAssignableAccounts(roleIds);

  /* Who is in it already, so they are not offered twice. This reads the first
     page only, so a role with more than 25 people can still show somebody who
     is already in — which is exactly why the API answers `added` and
     `alreadyIn` separately and re-adding is a no-op rather than an error. */
  const existing = useRoleMembers(role.id);

  const alreadyIn = useMemo(
    () => new Set(existing.members.map((member) => member.userId)),
    [existing.members],
  );

  const candidates = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return accounts
      .filter((account) => !alreadyIn.has(account.userId))
      .filter(
        (account) =>
          !needle ||
          account.name.toLowerCase().includes(needle) ||
          account.email.toLowerCase().includes(needle),
      );
  }, [accounts, alreadyIn, query]);

  return (
    <Modal
      open
      onClose={onClose}
      title={`Add people to ${role.name}`}
      description={`They get everything this role can do${
        role.labels.length > 0 ? `: ${role.labels.join(", ")}.` : "."
      }`}
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <p className="text-body-sm text-muted">
            {chosen.length === 0
              ? "Nobody selected"
              : `${chosen.length} selected`}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="accent"
              disabled={chosen.length === 0 || busy}
              loading={busy}
              onClick={() => {
                setBusy(true);
                void onAdd(chosen).finally(() => setBusy(false));
              }}
            >
              Add {chosen.length > 0 ? chosen.length : ""}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Input
          value={query}
          autoFocus
          placeholder="Search by name or email"
          onChange={(e) => {
            const value = e.target.value;
            setQuery(value);
          }}
        />

        {candidates.length === 0 ? (
          <EmptyState
            compact
            title={
              loading
                ? "Loading…"
                : query
                  ? "Nobody matches that"
                  : "Everybody with an account is already in this role"
            }
          />
        ) : (
          <ul className="flex max-h-80 flex-col divide-y divide-line overflow-y-auto rounded-md border border-line">
            {candidates.map((account) => (
              <li key={account.userId} className="px-3.5 py-2.5">
                <Checkbox
                  checked={chosen.includes(account.userId)}
                  onChange={(e) =>
                    setChosen((current) =>
                      e.target.checked
                        ? [...current, account.userId]
                        : current.filter((id) => id !== account.userId),
                    )
                  }
                  label={account.name}
                  description={account.email}
                />
              </li>
            ))}
          </ul>
        )}

        {note && <p className="text-body-sm text-muted">{note}</p>}
      </div>
    </Modal>
  );
}

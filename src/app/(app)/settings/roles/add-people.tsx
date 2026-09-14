"use client";

import { useMemo, useState } from "react";
import {
  Button,
  Callout,
  Checkbox,
  EmptyState,
  Input,
  Modal,
} from "@/components/ui";
import {
  useAssignableAccounts,
  useRoleMembers,
  type RoleView,
} from "@/lib/store/permissions";
import { nameSome } from "./role-editor";

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
 *
 * ## Granting `MANAGE_ROLES` to somebody with no personnel record
 *
 * A real, reported case: an owner's own sign-in had no `Employee` behind it,
 * and every action that reads "who is this" through that link — replying to a
 * help desk ticket among them — refused with a sentence about a staff record
 * nobody had thought to create. Loosening those checks was considered and
 * rejected: `employeeId` is how the product knows whose leave, whose payslip
 * and whose reply something is, and an owner is exactly the account most
 * likely to need that trail later, not less.
 *
 * So the fix is discoverability, not a weaker guard, and this is where it has
 * to live: this dialog already knows which candidates carry `employeeId:
 * null` — that is on every `RoleMember` — and it already knows whether the
 * role grants `MANAGE_ROLES`. Nothing here is blocked; `Owner` and any role
 * like it work perfectly well with no linked record. The callout below just
 * says so, and says where to fix it if the person actually is staff: the
 * `UnlinkedAccountsPanel` on the page this dialog sits on top of, whose whole
 * job is exactly this list. A toast timing out six seconds after the add
 * would be easy to miss; this is visible for as long as the box the account
 * is being chosen from.
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

  /* See the header: who is about to be granted access to manage roles while
     having nobody to attribute their own actions to. Recomputed as `chosen`
     changes, so ticking or unticking a name updates the callout live. */
  const managesRoles = role.permissions.includes("MANAGE_ROLES");
  const chosenUnlinked = useMemo(
    () =>
      managesRoles
        ? accounts.filter(
            (account) =>
              chosen.includes(account.userId) && account.employeeId === null,
          )
        : [],
    [accounts, chosen, managesRoles],
  );

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

        {chosenUnlinked.length > 0 && (
          <Callout tone="neutral">
            {chosenUnlinked.length === 1
              ? `${chosenUnlinked[0]!.name} has no personnel record yet.`
              : `${nameSome(chosenUnlinked.map((account) => account.name))} have no personnel record yet.`}{" "}
            {role.name} works fine without one — nothing here is blocked. If
            they are actually staff, close this and the role editor behind it,
            then link or create their record from{" "}
            <strong>Accounts with no personnel record</strong> on this screen.
          </Callout>
        )}

        {note && <p className="text-body-sm text-muted">{note}</p>}
      </div>
    </Modal>
  );
}

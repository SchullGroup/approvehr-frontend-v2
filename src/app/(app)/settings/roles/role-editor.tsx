"use client";

import { useMemo, useState } from "react";
import { Copy, TriangleAlert, UserMinus, UserPlus } from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  Drawer,
  EmptyState,
  Field,
  Input,
  Tabs,
  Textarea,
} from "@/components/ui";
import type { Catalogue } from "@/lib/api/permissions";
import type { PermissionKey, PermissionSet } from "@/lib/permissions";
import { hasPermission } from "@/lib/permissions";
import { PermissionMatrix } from "./permission-matrix";
import { useRoleMembers, type RoleView } from "@/lib/store/permissions";
import { AddPeopleDialog } from "./add-people";

/**
 * One role, open for editing.
 *
 * ## Two tabs, because there are two decisions
 *
 * *What it can do* and *who is in it* are separate questions with separate
 * risks, and putting them on one scrolling page means the second is always
 * below the fold. Both counts are on the tab, so neither is a surprise.
 *
 * ## A built-in role's name is fixed; what it can do is not
 *
 * This used to lock built-in roles completely, and the feedback asked for the
 * opposite: an owner should be able to retune HR manager rather than abandon it
 * and rebuild the whole thing as a custom role to change one checkbox. So the
 * lock split in two, and the two halves have different reasons.
 *
 * **The name stays fixed** because it is the role's identity — `seedSystemRoles`
 * upserts on `(organizationId, name)`, so renaming "HR manager" would make the
 * next seed create a second one beside it.
 *
 * **What it can do is editable**, for every built-in role except `Owner`. Owner
 * is "everything, by construction", which is the guarantee that a newly added
 * permission is held by somebody on the day it ships; an owner who can untick
 * their own "Manage access" leaves an organisation nobody can administer, and
 * unlike every other lockout that one cannot be repaired from inside the
 * product. Transferring ownership is the supported way to move that seat.
 *
 * Owner therefore still renders as `GrantedPermissions` below — a plain list of
 * what it grants, with nothing to toggle because nothing here toggles. Two
 * earlier versions of this screen got that wrong in two different directions:
 * the first rendered an editable form and let the save fail; the second
 * rendered every permission as a disabled switch, which reads as broken rather
 * than as fixed.
 *
 * ## The escalation guard is on the switch, not in the error
 *
 * Switches only exist on a custom role now, and the guard is still on them
 * rather than only in the error the API would return. It refuses to let
 * anybody hand out a permission they do not hold themselves — otherwise
 * "Manage access" quietly equals every permission, since its holder could mint
 * a role carrying anything and step into it. A switch for something the reader
 * cannot give out is disabled and says so in one line. Turning one **off** is
 * never blocked, which matches the API — HR has to be able to remove a
 * departing payroll officer without being able to approve payroll themselves.
 */
export function RoleEditor({
  role,
  catalogue,
  held,
  canManage,
  roleIds,
  onClose,
  onSave,
  onDuplicate,
  onAddPeople,
  onRemovePerson,
}: {
  role: RoleView;
  catalogue: Catalogue;
  /** What the person editing holds. Drives the escalation guard. */
  held: PermissionSet;
  canManage: boolean;
  /** Every role's id, for the add-people picker. See its header. */
  roleIds: string[];
  onClose: () => void;
  onSave: (patch: {
    name?: string;
    description?: string | null;
    permissions?: PermissionKey[];
  }) => Promise<boolean>;
  onDuplicate: () => void;
  onAddPeople: (userIds: string[]) => Promise<boolean>;
  onRemovePerson: (userId: string, name: string) => Promise<boolean>;
}) {
  const [tab, setTab] = useState<"permissions" | "people">("permissions");

  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description ?? "");
  const [draft, setDraft] = useState<PermissionKey[]>(role.permissions);
  const [saving, setSaving] = useState(false);

  /* Two locks, not one. See the header: the name is identity, the permission
     set is a decision — and only Owner's is ours to make rather than the
     company's. `OWNER_ROLE_NAME` is not imported from the API, so this matches
     on the name the seed writes; if a tenant has no role by that name then
     nothing here is locked, and the server's own last-holder guard is what
     stops a lockout. */
  const nameLocked = role.isSystem;
  const grantsLocked = role.isSystem && role.name === "Owner";
  const readOnly = !canManage;

  /* What changed, so the save button can say so and stay off when nothing did. */
  const changes = useMemo(() => {
    const list: string[] = [];
    if (!nameLocked && name.trim() !== role.name) list.push("name");
    if (description.trim() !== (role.description ?? ""))
      list.push("description");
    const added = draft.filter((key) => !role.permissions.includes(key));
    const removed = role.permissions.filter((key) => !draft.includes(key));
    if (added.length > 0) list.push(`${added.length} added`);
    if (removed.length > 0) list.push(`${removed.length} removed`);
    return { list, added, removed };
  }, [name, description, draft, role, nameLocked]);

  const dirty = changes.list.length > 0;

  const save = async () => {
    setSaving(true);
    const patch: {
      name?: string;
      description?: string | null;
      permissions?: PermissionKey[];
    } = {};
    if (!nameLocked && name.trim() !== role.name) patch.name = name.trim();
    if (description.trim() !== (role.description ?? "")) {
      patch.description = description.trim() === "" ? null : description.trim();
    }
    if (
      !grantsLocked &&
      (changes.added.length > 0 || changes.removed.length > 0)
    ) {
      patch.permissions = draft;
    }
    const ok = await onSave(patch);
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title={role.name}
      size="xl"
      {...(role.description ? { description: role.description } : {})}
      footer={
        tab === "permissions" ? (
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <p className="text-body-sm text-muted">
              {dirty ? changes.list.join(" · ") : "No changes"}
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              {grantsLocked ? (
                <Button variant="accent" onClick={onDuplicate}>
                  <Copy aria-hidden="true" className="size-4" />
                  Duplicate to edit
                </Button>
              ) : (
                <Button
                  variant="accent"
                  disabled={!dirty || saving || readOnly}
                  loading={saving}
                  onClick={() => void save()}
                >
                  Save changes
                </Button>
              )}
            </div>
          </div>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-5">
        <Tabs
          items={[
            {
              id: "permissions",
              label: "What they can do",
              count: draft.length,
            },
            { id: "people", label: "People", count: role.memberCount },
          ]}
          value={tab}
          onChange={(id) => setTab(id as "permissions" | "people")}
        />

        {tab === "permissions" ? (
          <PermissionsTab
            role={role}
            catalogue={catalogue}
            draft={draft}
            setDraft={setDraft}
            held={held}
            nameLocked={nameLocked}
            grantsLocked={grantsLocked}
            readOnly={readOnly}
            name={name}
            setName={setName}
            description={description}
            setDescription={setDescription}
          />
        ) : (
          <PeopleTab
            role={role}
            held={held}
            canManage={canManage}
            roleIds={roleIds}
            onAddPeople={onAddPeople}
            onRemovePerson={onRemovePerson}
          />
        )}
      </div>
    </Drawer>
  );
}

/* -------------------------------------------------------------------------- */

function PermissionsTab({
  role,
  catalogue,
  draft,
  setDraft,
  held,
  nameLocked,
  grantsLocked,
  readOnly,
  name,
  setName,
  description,
  setDescription,
}: {
  role: RoleView;
  catalogue: Catalogue;
  draft: PermissionKey[];
  setDraft: (next: PermissionKey[]) => void;
  held: PermissionSet;
  nameLocked: boolean;
  grantsLocked: boolean;
  readOnly: boolean;
  name: string;
  setName: (next: string) => void;
  description: string;
  setDescription: (next: string) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      {readOnly && !grantsLocked && (
        <Callout tone="neutral">
          You can see this role but not change it. Ask somebody who can manage
          access.
        </Callout>
      )}

      <div className="flex flex-col gap-4">
        <Field label="Name" required>
          <Input
            value={name}
            disabled={nameLocked || readOnly}
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
            disabled={readOnly}
            onChange={(e) => {
              const value = e.target.value;
              setDescription(value);
            }}
          />
        </Field>
      </div>

      {grantsLocked ? (
        <GrantedPermissions role={role} catalogue={catalogue} draft={draft} />
      ) : (
        <PermissionMatrix
          catalogue={catalogue}
          draft={draft}
          setDraft={setDraft}
          held={held}
          readOnly={readOnly}
        />
      )}
    </div>
  );
}

/**
 * What a built-in role can do, stated rather than offered.
 *
 * A disabled switch on every one of the catalogue's permissions — most of
 * them off — used to stand in for "this cannot be changed", which is a
 * strange way to say it: a row of controls nobody can touch reads as broken,
 * not as fixed. Since none of them can move, this shows only what is
 * actually granted, as a plain list, in the section order the catalogue
 * already defines. `Duplicate to edit` — in the drawer's own footer — is
 * where the reader who wants to change one of these goes.
 */
function GrantedPermissions({
  role,
  catalogue,
  draft,
}: {
  role: RoleView;
  catalogue: Catalogue;
  draft: PermissionKey[];
}) {
  const sections = catalogue.sections
    .map((section) => ({
      ...section,
      permissions: section.permissions.filter((entry) =>
        draft.includes(entry.key),
      ),
    }))
    .filter((section) => section.permissions.length > 0);

  if (sections.length === 0) {
    return (
      <Callout tone="neutral">
        {role.name} holds no permission at all. Access here is entirely
        self-service: reaching your own record, payslips and requests by being
        who they belong to, not by anything this role grants.
      </Callout>
    );
  }

  return (
    <>
      {sections.map((section) => (
        <section key={section.key} className="flex flex-col gap-3.5">
          <h3 className="text-meta font-semibold text-faint">
            {section.title}
          </h3>
          <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
            {section.permissions.map((entry) => (
              <li key={entry.key} className="px-3.5 py-3">
                <p className="flex items-center gap-2 text-body-sm font-medium text-ink">
                  {entry.label}
                  {entry.sensitive && (
                    <TriangleAlert
                      aria-label="Handle with care"
                      className="size-3.5 shrink-0 text-warning-text"
                    />
                  )}
                </p>
                <p className="mt-0.5 text-body-sm text-muted">
                  {entry.description}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Names up to three and counts the rest.
 *
 * The same shape the API's own refusals use ("names up to three of them"). A
 * seven-item list inside a sentence stops being a sentence, and the reader only
 * needs enough of it to recognise the shape of what they are missing.
 *
 * Exported for `add-people.tsx`, which needs the identical shape for a
 * different list (people about to be added with no personnel record) — one
 * function so the two cannot render the "and N more" rule differently.
 */
export function nameSome(labels: string[]): string {
  if (labels.length <= 3) return labels.join(", ");
  return `${labels.slice(0, 3).join(", ")} and ${labels.length - 3} more`;
}

function PeopleTab({
  role,
  held,
  canManage,
  roleIds,
  onAddPeople,
  onRemovePerson,
}: {
  role: RoleView;
  held: PermissionSet;
  canManage: boolean;
  roleIds: string[];
  onAddPeople: (userIds: string[]) => Promise<boolean>;
  onRemovePerson: (userId: string, name: string) => Promise<boolean>;
}) {
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const { members, total, loading } = useRoleMembers(role.id, query);

  /* Joining a role grants everything it holds, so the guard is the role's whole
     set rather than a difference — the same check the API makes. `labels` is
     parallel to `permissions`, so they zip. */
  const missing = role.permissions
    .map((key, index) => ({ key, label: role.labels[index] ?? key }))
    .filter((entry) => !hasPermission(held, entry.key));

  /* The genuine empty state — nobody in the role, and no search narrowing
     that down. "Nobody matches that" is a different situation (there ARE
     members, this search just missed) and keeps the button beside the
     search box, where it reads as "add someone else". The true empty state
     moves it below the empty-state text instead: beside an empty search box
     "Add people" reads as a second way to search, when it's actually the
     opposite — the one action that isn't search. */
  const genuinelyEmpty = members.length === 0 && !loading && !query;

  const addPeopleButton = canManage && (
    <Button
      variant="accent"
      size="sm"
      disabled={missing.length > 0}
      onClick={() => setAdding(true)}
    >
      <UserPlus aria-hidden="true" className="size-4" />
      Add people
    </Button>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          value={query}
          placeholder="Search by name or email"
          className="max-w-xs"
          onChange={(e) => {
            const value = e.target.value;
            setQuery(value);
          }}
        />
        {!genuinelyEmpty && addPeopleButton}
      </div>

      {missing.length > 0 && canManage && (
        <Callout tone="neutral">
          You cannot add people to {role.name}. It can do things you cannot:{" "}
          {nameSome(missing.map((entry) => entry.label))}. Ask somebody who can.
        </Callout>
      )}

      {members.length === 0 ? (
        <EmptyState
          compact
          title={
            loading
              ? "Loading…"
              : query
                ? "Nobody matches that"
                : `Nobody is in ${role.name}`
          }
          {...(loading || query
            ? {}
            : {
                description:
                  "A role with nobody in it changes nothing. Add the people who should have it.",
              })}
          {...(genuinelyEmpty ? { action: addPeopleButton } : {})}
        />
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
          {members.map((member) => (
            <li
              key={member.userId}
              className="flex flex-wrap items-center gap-3 px-3.5 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-body-sm font-medium text-ink">
                  {member.name}
                </p>
                <p className="truncate text-body-sm text-muted">
                  {member.email}
                </p>
              </div>
              {member.lastSignInAt === null && (
                <Badge tone="warning" size="sm">
                  Never signed in
                </Badge>
              )}
              {canManage && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy === member.userId}
                  onClick={() => {
                    setBusy(member.userId);
                    void onRemovePerson(member.userId, member.name).finally(
                      () => setBusy(null),
                    );
                  }}
                  aria-label={`Take ${member.name} out of ${role.name}`}
                >
                  <UserMinus aria-hidden="true" className="size-3.5" />
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {total > members.length && (
        <p className="text-body-sm text-muted">
          Showing {members.length} of {total}. Search to narrow it.
        </p>
      )}

      {adding && (
        <AddPeopleDialog
          role={role}
          roleIds={roleIds}
          onClose={() => setAdding(false)}
          onAdd={async (userIds) => {
            const ok = await onAddPeople(userIds);
            if (ok) setAdding(false);
            return ok;
          }}
        />
      )}
    </div>
  );
}
